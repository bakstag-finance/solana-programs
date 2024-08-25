use crate::*;

#[derive(Accounts)]
#[instruction(params: InitializeParams)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + OtcConfig::INIT_SPACE,
        seeds = [OtcConfig::OTC_SEED],
        bump
    )]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [Escrow::ESCROW_SEED],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

impl Initialize<'_> {
    pub fn apply(ctx: &mut Context<Initialize>, params: &InitializeParams) -> Result<()> {
        ctx.accounts.otc_config.bump = ctx.bumps.otc_config;
        ctx.accounts.otc_config.treasury = params.treasury;

        ctx.accounts.escrow.bump = ctx.bumps.escrow;

        Ok(())

        // let oapp_signer = ctx.accounts.otc_config.key();
        // ctx.accounts.otc_config.init(
        //     params.endpoint_program,
        //     ctx.accounts.payer.key(),
        //     ctx.remaining_accounts,
        //     oapp_signer,
        // )
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct InitializeParams {
    pub endpoint_program: Option<Pubkey>,

    pub treasury: Pubkey,
}