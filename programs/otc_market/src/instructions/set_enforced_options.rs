use crate::*;

#[derive(Accounts)]
#[instruction(params: SetEnforcedOptionsParams)]
pub struct SetEnforcedOptions<'info> {
    #[account(
        mut,
        constraint = otc_config.admin == admin.key() @ OtcError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + EnforcedOptions::INIT_SPACE,
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &params.dst_eid.to_be_bytes(),
        ],
        bump
    )]
    pub enforced_options: Account<'info, EnforcedOptions>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    pub system_program: Program<'info, System>,
}

impl SetEnforcedOptions<'_> {
    pub fn apply(
        ctx: &mut Context<SetEnforcedOptions>,
        params: &SetEnforcedOptionsParams
    ) -> Result<()> {
        oapp::options::assert_type_3(&params.send)?;
        ctx.accounts.enforced_options.send = params.send.clone();
        oapp::options::assert_type_3(&params.send_and_call)?;
        ctx.accounts.enforced_options.send_and_call = params.send_and_call.clone();
        ctx.accounts.enforced_options.bump = ctx.bumps.enforced_options;
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetEnforcedOptionsParams {
    pub dst_eid: u32,
    pub send: Vec<u8>,
    pub send_and_call: Vec<u8>,
}
