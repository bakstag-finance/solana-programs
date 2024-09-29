use crate::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{ Mint, TokenAccount, TokenInterface },
};
use oapp::endpoint::{ cpi::accounts::Clear, instructions::ClearParams, ConstructCPIContext };

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceive<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Peer::PEER_SEED,
            otc_config.key().as_ref(),
            &params.src_eid.to_be_bytes()
        ],
        bump = peer.bump,
        constraint = peer.address == params.sender @OtcError::InvalidSender
    )]
    pub peer: Account<'info, Peer>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        init_if_needed,
        payer = payer,
        seeds = [&offer_id(&params.message)],
        space = 8 + Offer::INIT_SPACE,
        bump
    )]
    pub offer: Account<'info, Offer>,

    /// NOTICE: required for offer accepted message

    #[account(
        constraint = src_buyer.key() == Pubkey::new_from_array(src_buyer_address(&params.message)) @ OtcError::InvalidSrcBuyer
    )]
    /// CHECK: asserted against the one passed in the message payload
    pub src_buyer: Option<AccountInfo<'info>>,

    #[account(mut, seeds = [Escrow::ESCROW_SEED], bump = escrow.bump)]
    /// NOTICE: required for src sol token - from | required for src spl token - authority
    pub escrow: Option<Box<Account<'info, Escrow>>>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::authority = src_buyer,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program
    )]
    /// NOTICE: required for src spl token - to_ata
    pub src_buyer_ata: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(
        mut,
        associated_token::authority = escrow,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program
    )]
    /// NOTICE: required for src spl token - from_ata
    pub src_escrow_ata: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(
        mint::token_program = token_program,
        constraint = src_token_mint.key() == Pubkey::new_from_array(offer.src_token_address) @ OtcError::InvalidSrcTokenMint
    )]
    /// NOTICE: required for src spl token - token_mint
    pub src_token_mint: Option<Box<InterfaceAccount<'info, Mint>>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    /// NOTICE: required for offer cancel order message

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &params.src_eid.to_be_bytes(), // equivalent to offer.src_eid
        ],
        bump = enforced_options.bump
    )]
    pub enforced_options: Option<Account<'info, EnforcedOptions>>,

    pub system_program: Program<'info, System>,
}

impl LzReceive<'_> {
    pub fn apply(ctx: &mut Context<LzReceive>, params: &LzReceiveParams) -> Result<()> {
        let msg_type = get_message_type(&params.message)?;

        match msg_type {
            Message::OfferCreated => {
                receive_offer_created(ctx, &params.message)?;
            }
            Message::OfferAccepted => {
                receive_offer_accepted(ctx, &params.message)?;
            }
            Message::OfferCancelOrder => {
                receive_offer_cancel_order(ctx, &params.message)?;
            }
            _ => (),
        }

        // clear
        oapp::endpoint_cpi::clear(
            ctx.accounts.otc_config.endpoint_program,
            ctx.accounts.otc_config.key(),
            &ctx.remaining_accounts[0..Clear::MIN_ACCOUNTS_LEN],
            &[OtcConfig::OTC_SEED, &[ctx.accounts.otc_config.bump]],
            ClearParams {
                receiver: ctx.accounts.otc_config.key(),
                src_eid: params.src_eid,
                sender: params.sender,
                nonce: params.nonce,
                guid: params.guid,
                message: params.message.clone(),
            }
        )?;

        Ok(())
    }
}
