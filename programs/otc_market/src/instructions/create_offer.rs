use crate::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use oapp::{
    endpoint::{instructions::SendParams as EndpointSendParams, MessagingFee, MessagingReceipt},
    endpoint_cpi::LzAccount,
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: CreateOfferParams, fee: MessagingFee)]
pub struct CreateOffer<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        init,
        payer = seller,
        seeds = [
            &Offer::hash_offer(
                &seller.key().to_bytes(),
                OtcConfig::EID,
                params.dst_eid,
                &OtcConfig::get_token_address(src_token_mint.as_ref()),
                &params.dst_token_address,
                params.exchange_rate_sd
            ),
        ],
        space = 8 + Offer::INIT_SPACE,
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(mut, seeds = [Escrow::ESCROW_SEED], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mint::token_program = token_program,
        constraint = src_token_mint.decimals >= OtcConfig::SHARED_DECIMALS @ OtcError::InvalidLocalDecimals
    )]
    /// NOTICE: required for src spl offer
    pub src_token_mint: Option<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::authority = seller,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program,
    )]
    /// NOTICE: required for src spl offer
    pub src_seller_ata: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = seller,
        associated_token::authority = escrow,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program
    )]
    /// NOTICE: required for src spl offer
    pub src_escrow_ata: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &params.dst_eid.to_be_bytes()],
        bump = peer.bump
    )]
    /// NOTICE: required for crosschain offer
    pub peer: Option<Account<'info, Peer>>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &params.dst_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    /// NOTICE: required for crosschain offer
    pub enforced_options: Option<Account<'info, EnforcedOptions>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

    pub system_program: Program<'info, System>,
}

impl CreateOffer<'_> {
    pub fn apply(
        ctx: &mut Context<CreateOffer>,
        params: &CreateOfferParams,
        fee: &MessagingFee,
    ) -> Result<(CreateOfferReceipt, MessagingReceipt)> {
        let src_token_address = OtcConfig::get_token_address(ctx.accounts.src_token_mint.as_ref());

        let (src_amount_sd, src_amount_ld): (u64, u64);
        {
            let decimal_conversion_rate =
                OtcConfig::get_decimal_conversion_rate(ctx.accounts.src_token_mint.as_ref());
            (src_amount_sd, src_amount_ld) =
                OtcConfig::remove_dust(params.src_amount_ld, decimal_conversion_rate);
        }

        // validate pricing
        require!(
            src_amount_sd != 0 && params.exchange_rate_sd != 0,
            OtcError::InvalidPricing
        );

        let offer: Offer = Offer {
            src_seller_address: ctx.accounts.seller.key().to_bytes(),
            dst_seller_address: params.dst_seller_address,
            src_eid: OtcConfig::EID,
            dst_eid: params.dst_eid,
            src_token_address,
            dst_token_address: params.dst_token_address,
            src_amount_sd,
            exchange_rate_sd: params.exchange_rate_sd,

            bump: ctx.bumps.offer,
        };

        // store, hash offer
        let offer_id = ctx.accounts.offer.init(&offer); // more efficient that set_inner

        // emit event
        emit_cpi!(OfferCreated {
            offer_id,
            src_seller_address: offer.src_seller_address,
            dst_seller_address: offer.dst_seller_address,
            src_eid: offer.src_eid,
            dst_eid: offer.dst_eid,
            src_token_address: offer.src_token_address,
            dst_token_address: offer.dst_token_address,
            src_amount_sd: offer.src_amount_sd,
            exchange_rate_sd: offer.exchange_rate_sd,
        });

        let mut receipt = MessagingReceipt::default();

        if params.dst_eid != OtcConfig::EID {
            // crosschain offer

            let peer = ctx.accounts.peer.as_ref().expect(OtcConfig::ERROR_MSG);
            let enforced_options = ctx
                .accounts
                .enforced_options
                .as_ref()
                .expect(OtcConfig::ERROR_MSG);

            let payload = build_create_offer_payload(&offer_id, &offer);

            receipt = oapp::endpoint_cpi::send(
                ctx.accounts.otc_config.endpoint_program,
                ctx.accounts.otc_config.key(),
                ctx.remaining_accounts,
                &[OtcConfig::OTC_SEED, &[ctx.accounts.otc_config.bump]],
                EndpointSendParams {
                    dst_eid: params.dst_eid,
                    receiver: peer.address,
                    message: payload,
                    options: enforced_options.get_enforced_options(&None),
                    native_fee: fee.native_fee,
                    lz_token_fee: fee.lz_token_fee,
                },
            )?;
        }

        OtcConfig::transfer(
            ctx.accounts.seller.as_ref(),
            src_amount_ld,
            Some(&ctx.accounts.escrow.to_account_info()),
            ctx.accounts.token_program.as_ref(),
            ctx.accounts.src_seller_ata.as_ref(),
            ctx.accounts.src_token_mint.as_ref(),
            ctx.accounts.src_escrow_ata.as_ref(),
            None,
        )?;

        Ok((
            CreateOfferReceipt {
                offer_id,
                src_amount_ld,
            },
            receipt,
        ))
    }
}

pub fn receive_offer_created_types(
    ctx: &Context<LzReceiveTypes>,
    params: &LzReceiveParams,
) -> Vec<LzAccount> {
    // accounts 2..3
    let (offer, _) = Pubkey::find_program_address(&[&offer_id(&params.message)], ctx.program_id);

    vec![LzAccount {
        pubkey: offer,
        is_signer: false,
        is_writable: true,
    }]
}

pub fn receive_offer_created(ctx: &mut Context<LzReceive>, message: &Vec<u8>) -> Result<()> {
    let offer: Offer = decode_offer_created(message, ctx.bumps.offer);

    // store, hash offer
    let offer_id = ctx.accounts.offer.init(&offer);

    // emit event
    emit_cpi!(OfferCreated {
        offer_id,
        src_seller_address: offer.src_seller_address,
        dst_seller_address: offer.dst_seller_address,
        src_eid: offer.src_eid,
        dst_eid: offer.dst_eid,
        src_token_address: offer.src_token_address,
        dst_token_address: offer.dst_token_address,
        src_amount_sd: offer.src_amount_sd,
        exchange_rate_sd: offer.exchange_rate_sd,
    });

    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateOfferParams {
    pub dst_seller_address: [u8; 32],
    pub dst_eid: u32,
    pub dst_token_address: [u8; 32],
    pub src_amount_ld: u64,
    pub exchange_rate_sd: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateOfferReceipt {
    pub offer_id: [u8; 32],
    pub src_amount_ld: u64,
}
