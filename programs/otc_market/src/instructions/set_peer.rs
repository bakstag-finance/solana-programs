use crate::*;

#[derive(Accounts)]
#[instruction(params: SetPeerParams)]
pub struct SetPeer<'info> {
    #[account(
        mut,
        constraint = otc_config.admin == admin.key() @ OtcError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + Peer::INIT_SPACE,
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &params.dst_eid.to_be_bytes()],
        bump
    )]
    pub peer: Account<'info, Peer>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    pub system_program: Program<'info, System>,
}

impl SetPeer<'_> {
    pub fn apply(ctx: &mut Context<SetPeer>, params: &SetPeerParams) -> Result<()> {
        ctx.accounts.peer.address = params.peer;
        ctx.accounts.peer.bump = ctx.bumps.peer;
        Ok(())
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SetPeerParams {
    pub dst_eid: u32,
    pub peer: [u8; 32],
}
