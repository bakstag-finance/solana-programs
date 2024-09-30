use crate::*;
use anchor_spl::token_interface::{ Mint, TokenInterface, TokenAccount };
use oapp::endpoint::{
    instructions::SendParams as EndpointSendParams,
    MessagingFee,
    MessagingReceipt,
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(offer_id: [u8; 32], fee: MessagingFee, extra_options: Vec<u8>)]
pub struct CancelOffer<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        mut,
        seeds = [&offer_id], 
        bump = offer.bump,
        constraint = offer.src_eid == OtcConfig::EID @ OtcError::InvalidEid,
        constraint = offer.src_seller_address == seller.key().to_bytes() @ OtcError::OnlySeller,
    )]
    pub offer: Account<'info, Offer>,

    /// src - NOTICE: required for monochain offer

    #[account(
        mut, // for sure created in create_offer instruction
        associated_token::authority = seller,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program
    )]
    /// NOTICE: required for src spl token - to_ata
    pub src_seller_ata: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::authority = escrow,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program
    )]
    /// NOTICE: required for src spl token - from_ata
    pub src_escrow_ata: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [Escrow::ESCROW_SEED], bump = escrow.bump)]
    /// NOTICE: required for src sol token - from | required for src spl token - authority
    pub escrow: Option<Account<'info, Escrow>>,

    #[account(
        mint::token_program = token_program,
        constraint = src_token_mint.key() == Pubkey::new_from_array(offer.src_token_address) @ OtcError::InvalidSrcTokenMint,
    )]
    /// NOTICE: required for src spl token - token_mint
    pub src_token_mint: Option<InterfaceAccount<'info, Mint>>,

    #[account(
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &offer.dst_eid.to_be_bytes()],
        bump = peer.bump
    )]
    /// NOTICE: required for crosschain offer
    pub peer: Option<Account<'info, Peer>>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &offer.dst_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    /// NOTICE: required for crosschain offer
    pub enforced_options: Option<Account<'info, EnforcedOptions>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,
}

impl CancelOffer<'_> {
    pub fn apply(
        ctx: &mut Context<CancelOffer>,
        offer_id: &[u8; 32],
        fee: &MessagingFee,
        extra_options: &Vec<u8>
    ) -> Result<MessagingReceipt> {
        let mut receipt = MessagingReceipt::default();

        if ctx.accounts.offer.src_eid == ctx.accounts.offer.dst_eid {
            // monochain offer
            let escrow = ctx.accounts.escrow.as_ref().expect(OtcConfig::ERROR_MSG);
            let src_token_mint = ctx.accounts.src_token_mint.as_ref();

            let amount_ld: u64;
            {
                let decimal_conversion_rate =
                    OtcConfig::get_decimal_conversion_rate(src_token_mint);
                amount_ld = OtcConfig::sd2ld(
                    ctx.accounts.offer.src_amount_sd,
                    decimal_conversion_rate
                );
            }

            // send src tokens to the seller
            OtcConfig::transfer(
                escrow.as_ref(),
                amount_ld,
                Some(ctx.accounts.seller.as_ref()),
                ctx.accounts.token_program.as_ref(),
                ctx.accounts.src_escrow_ata.as_ref(),
                src_token_mint,
                ctx.accounts.src_seller_ata.as_ref(),
                Some(&[&[Escrow::ESCROW_SEED, &[escrow.bump]]])
            )?;

            // emit event
            emit_cpi!(OfferCanceled {
                offer_id: *offer_id,
            });

            // delete offer
            close(ctx.accounts.offer.to_account_info(), ctx.accounts.seller.to_account_info())?;
        } else {
            // crosschain offer
            let peer = ctx.accounts.peer.as_ref().expect(OtcConfig::ERROR_MSG);
            let enforced_options = ctx.accounts.enforced_options
                .as_ref()
                .expect(OtcConfig::ERROR_MSG);

            let payload = build_cancel_offer_payload(&offer_id);

            receipt = oapp::endpoint_cpi::send(
                ctx.accounts.otc_config.endpoint_program,
                ctx.accounts.otc_config.key(),
                ctx.remaining_accounts,
                &[OtcConfig::OTC_SEED, &[ctx.accounts.otc_config.bump]],
                EndpointSendParams {
                    dst_eid: ctx.accounts.offer.dst_eid,
                    receiver: peer.address,
                    message: payload,
                    options: enforced_options.combine_options(&None, extra_options)?,
                    native_fee: fee.native_fee,
                    lz_token_fee: fee.lz_token_fee,
                }
            )?;
        }

        Ok(receipt)
    }
}
