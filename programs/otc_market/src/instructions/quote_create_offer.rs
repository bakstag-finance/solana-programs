use crate::*;
use anchor_spl::token_interface::{ Mint, TokenInterface };

#[derive(Accounts)]
#[instruction(src_seller_address: [u8; 32], params: CreateOfferParams)]
pub struct QuoteCreateOffer<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        mint::token_program = token_program,         
        constraint = src_token_mint.decimals >= OtcConfig::SHARED_DECIMALS @ OtcError::InvalidLocalDecimals
    )]
    pub src_token_mint: Option<InterfaceAccount<'info, Mint>>,

    #[account(seeds = [Escrow::ESCROW_SEED], bump)]
    pub escrow: Option<Account<'info, Escrow>>,

    pub token_program: Option<Interface<'info, TokenInterface>>,
}

impl QuoteCreateOffer<'_> {
    pub fn apply(
        ctx: &mut Context<QuoteCreateOffer>,
        src_seller_address: &[u8; 32],
        params: &CreateOfferParams
    ) -> Result<CreateOfferReceipt> {
        let src_token_address = OtcConfig::get_token_address(ctx.accounts.src_token_mint.as_ref());
        let src_decimal_conversion_rate = OtcConfig::get_decimal_conversion_rate(
            ctx.accounts.src_token_mint.as_ref()
        );

        let (src_amount_sd, src_amount_ld) = OtcConfig::remove_dust(
            params.src_amount_ld,
            src_decimal_conversion_rate
        );

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

        Ok(CreateOfferReceipt {
            offer_id,
            src_amount_ld,
        })
    }
}
