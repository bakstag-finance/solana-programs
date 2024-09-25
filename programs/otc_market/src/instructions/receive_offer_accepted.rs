use crate::*;

use oapp::endpoint_cpi::LzAccount;

pub fn receive_offer_accepted_types(
    ctx: &Context<LzReceiveTypes>,
    message: &[u8]
) -> Vec<LzAccount> {
    // 3..8 i.e. max 6 accounts

    // PROBLEM HERE - 7 > 6 accounts. Can be solved by not passing src_buyer as an account
    // but constructing its publicKey directly from message.src_buyer_address

    let (offer, _) = Pubkey::find_program_address(&[&offer_id(message)], ctx.program_id);

    // PROBLEM HERE - cannot extract offer specific accounts since it is just a public key

    vec![LzAccount {
        pubkey: offer,
        is_signer: false,
        is_writable: true,
    }]
}

pub fn receive_offer_accepted(ctx: &mut Context<LzReceive>, message: &Vec<u8>) -> Result<()> {
    let (offer_id, src_amount_sd, src_buyer_address, dst_buyer_address) =
        decode_offer_accepted(message);

    let offer = &mut ctx.accounts.offer;

    // update state
    offer.src_amount_sd -= src_amount_sd;

    // emit event
    emit_cpi!(OfferAccepted {
        offer_id,
        src_amount_sd,
        src_buyer_address,
        dst_buyer_address,
    });

    // transfer src tokens
    {
        let src_token_mint = ctx.accounts.src_token_mint.as_deref();
        let escrow = ctx.accounts.escrow.as_deref().expect(OtcConfig::ERROR_MSG);

        let src_amount_ld: u64;
        {
            let decimal_conversion_rate = OtcConfig::get_decimal_conversion_rate(src_token_mint);
            src_amount_ld = OtcConfig::sd2ld(src_amount_sd, decimal_conversion_rate);
        }

        OtcConfig::transfer(
            escrow.to_account_info().as_ref(),
            src_amount_ld,
            ctx.accounts.src_buyer.as_ref(),
            ctx.accounts.token_program.as_ref(),
            ctx.accounts.src_escrow_ata.as_deref(),
            src_token_mint,
            ctx.accounts.src_buyer_ata.as_deref(),
            Some(&[&[Escrow::ESCROW_SEED, &[escrow.bump]]])
        )?;
    }

    Ok(())
}
