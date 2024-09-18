use crate::*;
use anchor_lang::solana_program;
use oapp::endpoint_cpi::LzAccount;

#[derive(Accounts)]
pub struct LzReceiveTypes<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,
}

// account structure
// account 0 - payer (executor)
// account 1 - peer
// account 2 - otc config
// account 3 - offer
// account 4..8 - empty
// account 9 - system program
// account 10 - event authority
// account 11 - this program
// account remaining accounts
//  0..9 - accounts for clear
//  9..16 - accounts for compose
impl LzReceiveTypes<'_> {
    pub fn apply(
        ctx: &Context<LzReceiveTypes>,
        params: &LzReceiveParams
    ) -> Result<Vec<LzAccount>> {
        // accounts 0..1
        let (peer, _) = Pubkey::find_program_address(
            &[
                Peer::PEER_SEED,
                ctx.accounts.otc_config.key().as_ref(),
                &params.src_eid.to_be_bytes(),
            ],
            ctx.program_id
        );

        let mut accounts = vec![
            LzAccount { pubkey: Pubkey::default(), is_signer: true, is_writable: true }, // 0
            LzAccount { pubkey: peer, is_signer: false, is_writable: true } // 1
        ];

        // accounts 2..3
        let (offer, _) = Pubkey::find_program_address(
            &[&offer_id(&params.message)],
            ctx.program_id
        );
        accounts.extend_from_slice(
            &[
                LzAccount {
                    pubkey: ctx.accounts.otc_config.key(),
                    is_signer: false,
                    is_writable: false,
                }, // 2
                LzAccount {
                    pubkey: offer,
                    is_signer: false,
                    is_writable: true,
                }, // 3
            ]
        );

        // accounts 9..11
        let (event_authority_account, _) = Pubkey::find_program_address(
            &[oapp::endpoint_cpi::EVENT_SEED],
            &ctx.program_id
        );
        accounts.extend_from_slice(
            &[
                LzAccount {
                    pubkey: solana_program::system_program::ID,
                    is_signer: false,
                    is_writable: false,
                }, // 9
                LzAccount {
                    pubkey: event_authority_account,
                    is_signer: false,
                    is_writable: false,
                }, // 10
                LzAccount {
                    pubkey: ctx.program_id.key(),
                    is_signer: false,
                    is_writable: false,
                }, // 11
            ]
        );

        // remaining accounts 0..9
        let accounts_for_clear = oapp::endpoint_cpi::get_accounts_for_clear(
            ctx.accounts.otc_config.endpoint_program,
            &ctx.accounts.otc_config.key(),
            params.src_eid,
            &params.sender,
            params.nonce
        );
        accounts.extend(accounts_for_clear);

        Ok(accounts)
    }
}
