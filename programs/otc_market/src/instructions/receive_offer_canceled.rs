use crate::*;

use oapp::endpoint_cpi::LzAccount;
use anchor_spl::{
    associated_token::{
        get_associated_token_address_with_program_id,
        ID as associated_token_program,
    },
    token::ID as token_program,
};

// receive offer canceled

pub fn receive_offer_canceled_types(
    ctx: &Context<LzReceiveTypes>,
    message: &[u8]
) -> Vec<LzAccount> {
    let (offer_id, src_seller_address, src_token_address) = decode_offer_canceled(message);

    let (offer, _) = Pubkey::find_program_address(&[&offer_id], ctx.program_id);
    let src_seller = Pubkey::new_from_array(src_seller_address);
    let (escrow, _) = Pubkey::find_program_address(&[Escrow::ESCROW_SEED], ctx.program_id);
    let null_account = LzAccount {
        pubkey: *ctx.program_id,
        is_signer: false,
        is_writable: false,
    };

    if src_token_address == <[u8; 32]>::default() {
        // src token is SOL
        vec![
            LzAccount {
                pubkey: offer,
                is_signer: false,
                is_writable: true,
            },
            null_account.clone(), // NO enforced_options
            LzAccount {
                pubkey: src_seller,
                is_signer: false,
                is_writable: true,
            }, // src_seller
            null_account.clone(), // NO src_seller_ata
            LzAccount {
                pubkey: escrow,
                is_signer: false,
                is_writable: true,
            }, // escrow
            null_account.clone(), // NO src_escrow_ata
            null_account.clone(), // NO src_token_mint
            null_account.clone(), // NO associated_token_program
            null_account.clone() // NO token_program
        ]
    } else {
        // src token is SPL
        let src_token_mint = Pubkey::new_from_array(src_token_address);

        let src_seller_ata = get_associated_token_address_with_program_id(
            &src_seller,
            &src_token_mint,
            &token_program // stick to spl token program for mvp
        );
        let src_escrow_ata = get_associated_token_address_with_program_id(
            &escrow,
            &src_token_mint,
            &token_program // stick to spl token program for mvp
        );

        vec![
            LzAccount {
                pubkey: offer,
                is_signer: false,
                is_writable: true,
            },
            null_account.clone(), // NO enforced_options
            LzAccount {
                pubkey: src_seller,
                is_signer: false,
                is_writable: true,
            }, // src_seller
            LzAccount {
                pubkey: src_seller_ata,
                is_signer: false,
                is_writable: true,
            }, // src_seller_ata
            LzAccount {
                pubkey: escrow,
                is_signer: false,
                is_writable: true,
            }, // escrow
            LzAccount {
                pubkey: src_escrow_ata,
                is_signer: false,
                is_writable: true,
            }, // src_escrow_ata
            LzAccount {
                pubkey: src_token_mint,
                is_signer: false,
                is_writable: false,
            }, // src_token_mint
            LzAccount {
                pubkey: associated_token_program,
                is_signer: false,
                is_writable: false,
            }, // associated_token_program
            LzAccount {
                pubkey: token_program,
                is_signer: false,
                is_writable: false,
            } // token_program
        ]
    }
}

pub fn receive_offer_canceled(ctx: &mut Context<LzReceive>, message: &Vec<u8>) -> Result<()> {
    let (offer_id, _, _) = decode_offer_canceled(message);

    let escrow = ctx.accounts.escrow.as_deref().expect(OtcConfig::ERROR_MSG);
    let src_token_mint = ctx.accounts.src_token_mint.as_deref();

    let amount_ld: u64;
    {
        let decimal_conversion_rate = OtcConfig::get_decimal_conversion_rate(src_token_mint);
        amount_ld = OtcConfig::sd2ld(ctx.accounts.offer.src_amount_sd, decimal_conversion_rate);
    }

    // send src tokens to the seller
    OtcConfig::transfer(
        escrow.as_ref(),
        amount_ld,
        ctx.accounts.src_actor.as_ref(),
        ctx.accounts.token_program.as_ref(),
        ctx.accounts.src_escrow_ata.as_deref(),
        src_token_mint,
        ctx.accounts.src_actor_ata.as_deref(),
        Some(&[&[Escrow::ESCROW_SEED, &[escrow.bump]]])
    )?;

    // emit event
    emit_cpi!(OfferCanceled {
        offer_id,
    });

    // delete offer
    close(
        ctx.accounts.offer.to_account_info(),
        ctx.accounts.src_actor.as_ref().expect(OtcConfig::ERROR_MSG).to_account_info()
    )?;

    Ok(())
}
