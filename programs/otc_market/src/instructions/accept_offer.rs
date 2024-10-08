use crate::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{ Mint, TokenAccount, TokenInterface },
};
use oapp::endpoint::{
    instructions::SendParams as EndpointSendParams,
    MessagingReceipt,
    MessagingFee,
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: AcceptOfferParams, fee: MessagingFee)]
pub struct AcceptOffer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Box<Account<'info, OtcConfig>>,

    #[account(
        mut, 
        seeds = [&params.offer_id], 
        bump = offer.bump,
        constraint = offer.dst_eid == OtcConfig::EID @ OtcError::InvalidEid,
        constraint = offer.src_amount_sd >= params.src_amount_sd @ OtcError::ExcessiveAmount
    )]
    pub offer: Box<Account<'info, Offer>>,

    // dst

    #[account(
        mut,
        associated_token::authority = buyer,
        associated_token::mint = dst_token_mint,
        associated_token::token_program = token_program,
    )]
    /// NOTICE: required for dst spl token - from_ata
    pub dst_buyer_ata: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::authority = dst_seller,
        associated_token::mint = dst_token_mint,
        associated_token::token_program = token_program
    )]
    /// NOTICE: required for dst spl token - to_ata
    pub dst_seller_ata: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(
        mut, 
        // constraint = dst_seller.key() == Pubkey::new_from_array(offer.dst_seller_address) @ OtcError::InvalidDstSeller
    )]
    /// CHECK: asserted against the one stored in the offer
    /// NOTICE: required for dst sol token - to | required for dst spl token - (init_if_needed)
    pub dst_seller: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::authority = treasury,
        associated_token::mint = dst_token_mint,
        associated_token::token_program = token_program
    )]
    /// NOTICE: required for dst spl token - fee: to_ata
    pub dst_treasury_ata: Option<Box<InterfaceAccount<'info, TokenAccount>>>,

    #[account(
        mut, 
        // constraint = treasury.key() == otc_config.treasury @ OtcError::InvalidTreasury
    )]
    /// NOTICE: required for dst sol token - fee: to
    pub treasury: Option<AccountInfo<'info>>,

    #[account(
        mint::token_program = token_program,
        // constraint = dst_token_mint.key() == Pubkey::new_from_array(offer.dst_token_address) @ OtcError::InvalidDstTokenMint,
        constraint = dst_token_mint.decimals >= OtcConfig::SHARED_DECIMALS @ OtcError::InvalidLocalDecimals
    )]
    /// NOTICE: required for dst spl token - token_mint
    pub dst_token_mint: Option<Box<InterfaceAccount<'info, Mint>>>,

    /// src - NOTICE: required for monochain offer

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::authority = buyer,
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

    #[account(mut, seeds = [Escrow::ESCROW_SEED], bump = escrow.bump)]
    /// NOTICE: required for src sol token - from | required for src spl token - authority
    pub escrow: Option<Box<Account<'info, Escrow>>>,

    #[account(
        mint::token_program = token_program
        // constraint = src_token_mint.key() == Pubkey::new_from_array(offer.src_token_address) @ OtcError::InvalidSrcTokenMint
    )]
    /// NOTICE: required for src spl token - token_mint
    pub src_token_mint: Option<Box<InterfaceAccount<'info, Mint>>>,

    #[account(
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &offer.src_eid.to_be_bytes()],
        bump = peer.bump
    )]
    /// NOTICE: required for crosschain offer
    pub peer: Option<Box<Account<'info, Peer>>>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &offer.src_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    /// NOTICE: required for crosschain offer
    pub enforced_options: Option<Box<Account<'info, EnforcedOptions>>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    pub system_program: Program<'info, System>,
}

impl AcceptOffer<'_> {
    pub fn apply(
        ctx: &mut Context<AcceptOffer>,
        params: &AcceptOfferParams,
        fee: &MessagingFee
    ) -> Result<(AcceptOfferReceipt, MessagingReceipt)> {
        {
            // assert accounts match offer params
            if let Some(src_token_mint) = ctx.accounts.src_token_mint.as_ref() {
                require!(
                    src_token_mint.key() ==
                        Pubkey::new_from_array(ctx.accounts.offer.src_token_address),
                    OtcError::InvalidSrcTokenMint
                );
            }

            if let Some(dst_token_mint) = ctx.accounts.dst_token_mint.as_ref() {
                require!(
                    dst_token_mint.key() ==
                        Pubkey::new_from_array(ctx.accounts.offer.dst_token_address),
                    OtcError::InvalidDstTokenMint
                );
            }

            if let Some(treasury) = ctx.accounts.treasury.as_ref() {
                require!(
                    treasury.key() == ctx.accounts.otc_config.treasury,
                    OtcError::InvalidTreasury
                );
            }

            require!(
                ctx.accounts.dst_seller.key() ==
                    Pubkey::new_from_array(ctx.accounts.offer.dst_seller_address),
                OtcError::InvalidDstSeller
            );
        }

        let dst_token_mint = ctx.accounts.dst_token_mint.as_deref();
        let accept_offer_receipt = OtcConfig::to_dst_amount(
            params.src_amount_sd,
            ctx.accounts.offer.exchange_rate_sd,
            dst_token_mint
        );

        // update state
        ctx.accounts.offer.src_amount_sd -= params.src_amount_sd;

        // emit event
        emit_cpi!(OfferAccepted {
            offer_id: params.offer_id,
            src_amount_sd: params.src_amount_sd,
            src_buyer_address: params.src_buyer_address,
            dst_buyer_address: ctx.accounts.buyer.key().to_bytes(),
        });

        // send dst tokens
        {
            let dst_buyer_ata = ctx.accounts.dst_buyer_ata.as_deref();

            // (amount - fee) to seller
            OtcConfig::transfer(
                ctx.accounts.buyer.as_ref(),
                accept_offer_receipt.dst_amount_ld - accept_offer_receipt.fee_ld,
                Some(ctx.accounts.dst_seller.as_ref()),
                ctx.accounts.token_program.as_ref(),
                dst_buyer_ata,
                dst_token_mint,
                ctx.accounts.dst_seller_ata.as_deref(),
                None
            )?;

            // fee to treasury
            OtcConfig::transfer(
                ctx.accounts.buyer.as_ref(),
                accept_offer_receipt.fee_ld,
                ctx.accounts.treasury.as_ref(),
                ctx.accounts.token_program.as_ref(),
                dst_buyer_ata,
                dst_token_mint,
                ctx.accounts.dst_treasury_ata.as_deref(),
                None
            )?;
        }

        let mut receipt = MessagingReceipt::default();
        // monochain offer
        if ctx.accounts.offer.src_eid == ctx.accounts.offer.dst_eid {
            let src_token_mint = ctx.accounts.src_token_mint.as_deref();
            let escrow = ctx.accounts.escrow.as_deref().expect(OtcConfig::ERROR_MSG);

            let amount_ld: u64;
            {
                let decimal_conversion_rate =
                    OtcConfig::get_decimal_conversion_rate(src_token_mint);
                amount_ld = OtcConfig::sd2ld(params.src_amount_sd, decimal_conversion_rate);
            }

            // send src tokens to the buyer
            OtcConfig::transfer(
                escrow.to_account_info().as_ref(),
                amount_ld,
                Some(ctx.accounts.buyer.as_ref()),
                ctx.accounts.token_program.as_ref(),
                ctx.accounts.src_escrow_ata.as_deref(),
                src_token_mint,
                ctx.accounts.src_buyer_ata.as_deref(),
                Some(&[&[Escrow::ESCROW_SEED, &[escrow.bump]]])
            )?;
        } else {
            let peer = ctx.accounts.peer.as_ref().expect(OtcConfig::ERROR_MSG);
            let enforced_options = ctx.accounts.enforced_options
                .as_ref()
                .expect(OtcConfig::ERROR_MSG);

            let payload = build_accept_offer_payload(
                &params.offer_id,
                params.src_amount_sd,
                &params.src_buyer_address,
                &ctx.accounts.buyer.key().to_bytes()
            );

            receipt = oapp::endpoint_cpi::send(
                ctx.accounts.otc_config.endpoint_program,
                ctx.accounts.otc_config.key(),
                ctx.remaining_accounts,
                &[OtcConfig::OTC_SEED, &[ctx.accounts.otc_config.bump]],
                EndpointSendParams {
                    dst_eid: ctx.accounts.offer.src_eid,
                    receiver: peer.address,
                    message: payload,
                    options: enforced_options.get_enforced_options(&None),
                    native_fee: fee.native_fee,
                    lz_token_fee: fee.lz_token_fee,
                }
            )?;
        }

        Ok((accept_offer_receipt, receipt))
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AcceptOfferParams {
    pub offer_id: [u8; 32],
    pub src_amount_sd: u64,
    pub src_buyer_address: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AcceptOfferReceipt {
    pub dst_amount_ld: u64,
    pub fee_ld: u64,
}
