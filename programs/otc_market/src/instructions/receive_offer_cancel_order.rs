use crate::*;

use oapp::endpoint_cpi::LzAccount;
use oapp::endpoint::{
    instructions::QuoteParams as EndpointQuoteParams,
    instructions::SendParams as EndpointSendParams,
};

pub fn receive_offer_cancel_order_types(
    ctx: &Context<LzReceiveTypes>,
    message: &[u8],
    src_eid: u32
) -> Vec<LzAccount> {
    let (offer, _) = Pubkey::find_program_address(
        &[&decode_offer_cancel_order(message)],
        ctx.program_id
    );
    let (enforced_options, _) = Pubkey::find_program_address(
        &[
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            ctx.accounts.otc_config.key().as_ref(),
            &src_eid.to_be_bytes(),
        ],
        ctx.program_id
    );
    let null_account = LzAccount {
        pubkey: *ctx.program_id,
        is_signer: false,
        is_writable: false,
    };

    vec![
        LzAccount {
            pubkey: offer,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: enforced_options,
            is_signer: false,
            is_writable: false,
        }, // enforced_options
        null_account.clone(), // NO src_buyer
        null_account.clone(), // NO src_buyer_ata
        null_account.clone(), // NO src_seller
        null_account.clone(), // NO src_seller_ata
        null_account.clone(), // NO escrow
        null_account.clone(), // NO src_escrow_ata
        null_account.clone(), // NO associated_token_program
        null_account.clone() // NO token_program
    ]
}

pub fn receive_offer_cancel_order(ctx: &mut Context<LzReceive>, message: &Vec<u8>) -> Result<()> {
    let enforced_options = ctx.accounts.enforced_options.as_ref().expect(OtcConfig::ERROR_MSG);

    let offer_id = decode_offer_cancel_order(message);

    let payload = build_cancel_offer_payload(&offer_id);

    let fee = oapp::endpoint_cpi::quote(
        ctx.accounts.otc_config.endpoint_program,
        ctx.remaining_accounts,
        EndpointQuoteParams {
            sender: ctx.accounts.otc_config.key(),
            dst_eid: ctx.accounts.offer.dst_eid,
            receiver: ctx.accounts.peer.address,
            message: payload.clone(),
            pay_in_lz_token: false,
            options: enforced_options.get_enforced_options(&None),
        }
    )?;

    oapp::endpoint_cpi::send(
        ctx.accounts.otc_config.endpoint_program,
        ctx.accounts.otc_config.key(),
        ctx.remaining_accounts,
        &[OtcConfig::OTC_SEED, &[ctx.accounts.otc_config.bump]],
        EndpointSendParams {
            dst_eid: ctx.accounts.offer.dst_eid,
            receiver: ctx.accounts.peer.address,
            message: payload,
            options: enforced_options.get_enforced_options(&None),
            native_fee: fee.native_fee,
            lz_token_fee: fee.lz_token_fee,
        }
    )?;

    Ok(())
}
