use crate::*;
use anchor_spl::token_interface::{ Mint, TokenInterface };
use oapp::endpoint::{ instructions::QuoteParams as EndpointQuoteParams, MessagingFee };

#[derive(Accounts)]
#[instruction(params: CreateOfferParams)]
pub struct QuoteCreateOffer<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        mint::token_program = token_program,         
        constraint = src_token_mint.decimals >= OtcConfig::SHARED_DECIMALS @ OtcError::InvalidLocalDecimals
    )]
    pub src_token_mint: Option<InterfaceAccount<'info, Mint>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    /// NOTICE: required for crosschain offer
    #[account(
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &params.dst_eid.to_be_bytes()],
        bump = peer.bump
    )]
    pub peer: Option<Account<'info, Peer>>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &params.dst_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    pub enforced_options: Option<Account<'info, EnforcedOptions>>,
}

impl QuoteCreateOffer<'_> {
    pub fn apply(
        ctx: &mut Context<QuoteCreateOffer>,
        src_seller_address: &[u8; 32],
        params: &CreateOfferParams,
        pay_in_lz_token: bool
    ) -> Result<(CreateOfferReceipt, MessagingFee)> {
        let src_token_address = OtcConfig::get_token_address(ctx.accounts.src_token_mint.as_ref());

        let (src_amount_sd, src_amount_ld): (u64, u64);
        {
            let decimal_conversion_rate = OtcConfig::get_decimal_conversion_rate(
                ctx.accounts.src_token_mint.as_ref()
            );
            (src_amount_sd, src_amount_ld) = OtcConfig::remove_dust(
                params.src_amount_ld,
                decimal_conversion_rate
            );
        }

        // validate pricing
        require!(src_amount_sd != 0 && params.exchange_rate_sd != 0, OtcError::InvalidPricing);

        let offer_id = Offer::hash_offer(
            src_seller_address,
            OtcConfig::EID,
            params.dst_eid,
            &src_token_address,
            &params.dst_token_address,
            params.exchange_rate_sd
        );
        let messaging_fee: MessagingFee;

        if params.dst_eid != OtcConfig::EID {
            // crosschain
            let peer = ctx.accounts.peer.as_ref().expect(OtcConfig::ERROR_MSG);
            let enforced_options = ctx.accounts.enforced_options
                .as_ref()
                .expect(OtcConfig::ERROR_MSG);

            let payload = build_create_offer_payload(
                &offer_id,
                &src_seller_address,
                &params.dst_seller_address,
                OtcConfig::EID,
                params.dst_eid,
                &src_token_address,
                &params.dst_token_address,
                src_amount_sd,
                params.exchange_rate_sd
            );

            messaging_fee = oapp::endpoint_cpi::quote(
                ctx.accounts.otc_config.endpoint_program,
                ctx.remaining_accounts,
                EndpointQuoteParams {
                    sender: ctx.accounts.otc_config.key(),
                    dst_eid: params.dst_eid,
                    receiver: peer.address,
                    message: payload,
                    pay_in_lz_token,
                    options: enforced_options.get_enforced_options(&None),
                }
            )?;
        } else {
            // monochain
            messaging_fee = MessagingFee::default();
        }

        Ok((
            CreateOfferReceipt {
                offer_id,
                src_amount_ld,
            },
            messaging_fee,
        ))
    }
}
