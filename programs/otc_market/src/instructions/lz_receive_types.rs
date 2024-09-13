use crate::*;
use anchor_lang::solana_program;
use anchor_spl::{
    associated_token::{get_associated_token_address_with_program_id, ID as ASSOCIATED_TOKEN_ID},
    token_interface::Mint,
};
use oapp::endpoint_cpi::LzAccount;

#[derive(Accounts)]
pub struct LzReceiveTypes<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,
}

// account structure
// account 0 - payer (executor)
// account 1 - offer
// account 9 - system program
// account 10 - event authority
// account 11 - this program
// account remaining accounts
//  0..9 - accounts for clear
//  9..16 - accounts for compose
impl LzReceiveTypes<'_> {
    pub fn apply(
        ctx: &Context<LzReceiveTypes>,
        params: &LzReceiveParams,
    ) -> Result<Vec<LzAccount>> {
        const ERROR: &'static str = "Slice with incorrect length";

        let otc = &ctx.accounts.otc_config;

        let (offer, _) = Pubkey::find_program_address(
            &[&<&[u8] as TryInto<Vec<u8>>>::try_into(&params.message[1..33]).expect(&ERROR)],
            // &[&Offer::hash_offer(
            //     params.message[33..65].try_into().expect(&ERROR),
            //     u32::from_be_bytes(params.message[97..101].try_into().expect(&ERROR)),
            //     u32::from_be_bytes(params.message[101..105].try_into().expect(&ERROR)),
            //     params.message[105..137].try_into().expect(&ERROR),
            //     params.message[137..169].try_into().expect(&ERROR),
            //     u64::from_be_bytes(params.message[177..185].try_into().expect(&ERROR)),
            // )],
            ctx.program_id,
        );
        let mut accounts = vec![
            LzAccount {
                pubkey: Pubkey::default(),
                is_signer: true,
                is_writable: true,
            }, // 0
            LzAccount {
                pubkey: offer,
                is_signer: false,
                is_writable: true,
            }, // 1
        ];

        // account 9..11
        let (event_authority_account, _) =
            Pubkey::find_program_address(&[oapp::endpoint_cpi::EVENT_SEED], &ctx.program_id);
        accounts.extend_from_slice(&[
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
        ]);

        let endpoint_program = ctx.accounts.otc_config.endpoint_program;
        // remaining accounts 0..9
        let accounts_for_clear = oapp::endpoint_cpi::get_accounts_for_clear(
            endpoint_program,
            &otc.key(),
            params.src_eid,
            &params.sender,
            params.nonce,
        );
        accounts.extend(accounts_for_clear);

        // // remaining accounts 9..16
        // if let Some(message) = msg_codec::compose_msg(&params.message) {
        //     let amount_sd = msg_codec::amount_sd(&params.message);
        //     let amount_ld = ctx.accounts.oft_config.sd2ld(amount_sd);
        //     let amount_received_ld = get_post_fee_amount_ld(
        //         &ctx.accounts.oft_config.ext,
        //         &ctx.accounts.token_mint,
        //         amount_ld,
        //     )?;

        //     let accounts_for_composing = oapp::endpoint_cpi::get_accounts_for_send_compose(
        //         endpoint_program,
        //         &oft.key(),
        //         &to_address,
        //         &params.guid,
        //         0,
        //         &compose_msg_codec::encode(
        //             params.nonce,
        //             params.src_eid,
        //             amount_received_ld,
        //             &message,
        //         ),
        //     );
        //     accounts.extend(accounts_for_composing);
        // }

        Ok(accounts)
    }
}
