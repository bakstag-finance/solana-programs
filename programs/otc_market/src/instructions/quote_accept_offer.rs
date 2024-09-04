use crate::*;
use anchor_spl::token_interface::{ Mint, TokenInterface };
use oapp::endpoint::{ instructions::QuoteParams as EndpointQuoteParams, MessagingFee };

#[derive(Accounts)]
#[instruction(params: AcceptOfferParams)]
pub struct QuoteAcceptOffer<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        seeds = [&params.offer_id], 
        bump = offer.bump,
        constraint = offer.dst_eid == OtcConfig::EID @ OtcError::InvalidEid,
        constraint = offer.src_amount_sd >= params.src_amount_sd @ OtcError::ExcessiveAmount
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mint::token_program = token_program,
        constraint = dst_token_mint.key() == Pubkey::new_from_array(offer.dst_token_address) @ OtcError::InvalidDstTokenMint,
        constraint = dst_token_mint.decimals >= OtcConfig::SHARED_DECIMALS @ OtcError::InvalidLocalDecimals
    )]
    /// NOTICE: required for dst spl token - token_mint
    pub dst_token_mint: Option<InterfaceAccount<'info, Mint>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    /// NOTICE: required for crosschain offer
    #[account(
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &offer.src_eid.to_be_bytes()],
        bump = peer.bump
    )]
    pub peer: Option<Account<'info, Peer>>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &offer.src_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    pub enforced_options: Option<Account<'info, EnforcedOptions>>,
}

impl QuoteAcceptOffer<'_> {
    pub fn apply(
        ctx: &mut Context<QuoteAcceptOffer>,
        dst_buyer_address: &[u8; 32],
        params: &AcceptOfferParams,
        pay_in_lz_token: bool
    ) -> Result<(AcceptOfferReceipt, MessagingFee)> {
        let messaging_fee: MessagingFee;
        if ctx.accounts.offer.src_eid != OtcConfig::EID {
            // crosschain
            let peer = ctx.accounts.peer.as_ref().expect(OtcConfig::ERROR_MSG);
            let enforced_options = ctx.accounts.enforced_options
                .as_ref()
                .expect(OtcConfig::ERROR_MSG);

            let payload = build_accept_offer_payload(
                &params.offer_id,
                params.src_amount_sd,
                &params.src_buyer_address,
                dst_buyer_address
            );

            messaging_fee = oapp::endpoint_cpi::quote(
                ctx.accounts.otc_config.endpoint_program,
                ctx.remaining_accounts,
                EndpointQuoteParams {
                    sender: ctx.accounts.otc_config.key(),
                    dst_eid: ctx.accounts.offer.src_eid,
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
            OtcConfig::to_dst_amount(
                params.src_amount_sd,
                ctx.accounts.offer.exchange_rate_sd,
                ctx.accounts.dst_token_mint.as_ref()
            ),
            messaging_fee,
        ))
    }
}
