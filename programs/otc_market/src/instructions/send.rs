use crate::*;
use oapp::endpoint::{instructions::SendParams as EndpointSendParams, MessagingReceipt};

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: SendParams)]
pub struct Send<'info> {
    pub signer: Signer<'info>,
    
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Box<Account<'info, OtcConfig>>,

    #[account(
        mut,
        seeds = [
            Peer::PEER_SEED,
            otc_config.key().to_bytes().as_ref(),
            &params.dst_eid.to_be_bytes()
        ],
        bump = peer.bump
    )]
    pub peer: Account<'info, Peer>,
    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &params.dst_eid.to_be_bytes()
        ],
        bump = enforced_options.bump
    )]
    pub enforced_options: Account<'info, EnforcedOptions>,

}

impl Send<'_> {
    pub fn apply(ctx: &mut Context<Send>, params: &SendParams) -> Result<MessagingReceipt> {
        let message = "Hello World!";
        let receipt = oapp::endpoint_cpi::send(
            ctx.accounts.otc_config.endpoint_program,
            ctx.accounts.otc_config.key(),
            ctx.remaining_accounts,
            &[
                OtcConfig::OTC_SEED,
                &[ctx.accounts.otc_config.bump],
            ],
            EndpointSendParams {
                dst_eid: params.dst_eid,
                receiver: ctx.accounts.peer.address,
                message: message.as_bytes().to_vec(),
                options: ctx
                    .accounts
                    .enforced_options
                    .combine_options(&params.compose_msg, &params.options)?,
                native_fee: params.native_fee,
                lz_token_fee: params.lz_token_fee,
            },
        )?;

        // emit_cpi!(OFTSent {
        //     guid: receipt.guid,
        //     dst_eid: params.dst_eid,
        //     from: ctx.accounts.token_source.key(),
        //     amount_sent_ld,
        //     amount_received_ld
        // });

        Ok(receipt)
    }
}


#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct SendParams {
    pub dst_eid: u32,
    pub options: Vec<u8>,
    pub compose_msg: Option<Vec<u8>>,
    pub native_fee: u64,
    pub lz_token_fee: u64,
}
