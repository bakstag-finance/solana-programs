use crate::*;

use oapp::endpoint_cpi::LzAccount;

pub fn receive_offer_created_types(
    ctx: &Context<LzReceiveTypes>,
    message: &[u8]
) -> Vec<LzAccount> {
    let (offer, _) = Pubkey::find_program_address(&[&offer_id(message)], ctx.program_id);

    vec![
        LzAccount {
            pubkey: offer,
            is_signer: false,
            is_writable: true,
        },
        LzAccount {
            pubkey: *ctx.program_id,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: *ctx.program_id,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: *ctx.program_id,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: *ctx.program_id,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: *ctx.program_id,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: *ctx.program_id,
            is_signer: false,
            is_writable: false,
        },
        LzAccount {
            pubkey: *ctx.program_id,
            is_signer: false,
            is_writable: false,
        }
    ]
}

pub fn receive_offer_created(ctx: &mut Context<LzReceive>, message: &Vec<u8>) -> Result<()> {
    let offer: Offer = decode_offer_created(message, ctx.bumps.offer);

    // store, hash offer
    let offer_id = ctx.accounts.offer.init(&offer);

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

    Ok(())
}
