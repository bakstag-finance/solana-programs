use crate::*;
use oapp::endpoint::{ instructions::QuoteParams as EndpointQuoteParams, MessagingFee };

#[derive(Accounts)]
#[instruction(params: QuoteParams)]
pub struct Quote<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        mut,
        seeds = [
            Peer::PEER_SEED,
            otc_config.key().as_ref(),
            &params.dst_eid.to_be_bytes()
        ],
        bump = peer.bump
    )]
    pub peer: Account<'info, Peer>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &params.dst_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    pub enforced_options: Account<'info, EnforcedOptions>,
}

impl Quote<'_> {
    pub fn apply(ctx: &Context<Quote>, params: &QuoteParams) -> Result<MessagingFee> {
        let message = "Hello World!";
        // calling endpoint cpi
        oapp::endpoint_cpi::quote(
            ctx.accounts.otc_config.endpoint_program,
            ctx.remaining_accounts,
            EndpointQuoteParams {
                sender: ctx.accounts.otc_config.key(),
                dst_eid: params.dst_eid,
                receiver: ctx.accounts.peer.address,
                message: message.as_bytes().to_vec(),
                pay_in_lz_token: params.pay_in_lz_token,
                options: ctx.accounts.enforced_options.combine_options(
                    &params.compose_msg,
                    &params.options
                )?,
            }
        )
    }
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct QuoteParams {
    pub dst_eid: u32,
    pub to: [u8; 32],
    pub options: Vec<u8>,
    pub compose_msg: Option<Vec<u8>>,
    pub pay_in_lz_token: bool,
}
