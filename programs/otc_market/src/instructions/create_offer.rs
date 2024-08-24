use crate::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{ Mint, TokenAccount, TokenInterface },
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: CreateOfferParams)]
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

    #[account(
        mint::token_program = token_program,
        constraint = src_token_mint.decimals >= OtcConfig::SHARED_DECIMALS @ OtcError::InvalidLocalDecimals
    )]
    pub src_token_mint: Option<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::authority = seller,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program,
    )]
    pub src_seller_ata: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = seller,
        associated_token::authority = escrow,
        associated_token::mint = src_token_mint,
        associated_token::token_program = token_program
    )]
    pub escrow_ata: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [Escrow::ESCROW_SEED], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,

    pub token_program: Option<Interface<'info, TokenInterface>>,

    pub associated_token_program: Option<Program<'info, AssociatedToken>>,

    pub system_program: Program<'info, System>,
}

impl CreateOffer<'_> {
    pub fn apply(
        ctx: &mut Context<CreateOffer>,
        params: &CreateOfferParams
    ) -> Result<CreateOfferReceipt> {
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

        let escrow_sol_account_info: AccountInfo = ctx.accounts.escrow.to_account_info();

        OtcConfig::transfer(
            ctx.accounts.seller.as_ref(),
            src_amount_ld,
            Some(&escrow_sol_account_info),
            ctx.accounts.token_program.as_ref(),
            ctx.accounts.src_seller_ata.as_ref(),
            ctx.accounts.src_token_mint.as_ref(),
            ctx.accounts.escrow_ata.as_ref(),
            None
        )?;

        Ok(CreateOfferReceipt {
            offer_id,
            src_amount_ld,
        })
    }
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
