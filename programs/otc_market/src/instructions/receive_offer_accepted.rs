use crate::*;

use oapp::endpoint_cpi::LzAccount;
use anchor_spl::{
    associated_token::{
        get_associated_token_address_with_program_id,
        ID as associated_token_program,
    },
    token::ID as token_program,
};

pub fn receive_offer_accepted_types(
    ctx: &Context<LzReceiveTypes>,
    message: &[u8]
) -> Vec<LzAccount> {
    let (offer_id, _, src_buyer_address, _, src_token_address) = decode_offer_accepted(message);

    let (offer, _) = Pubkey::find_program_address(&[&offer_id], ctx.program_id);
    let (escrow, _) = Pubkey::find_program_address(&[Escrow::ESCROW_SEED], ctx.program_id);
    let src_buyer = Pubkey::new_from_array(src_buyer_address);
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
                pubkey: src_buyer,
                is_signer: false,
                is_writable: false,
            }, // src_buyer
            null_account.clone(), // NO src_buyer_ata
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
        let src_buyer_ata = get_associated_token_address_with_program_id(
            &src_buyer,
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
                pubkey: src_buyer,
                is_signer: false,
                is_writable: false,
            }, // src_buyer
            LzAccount {
                pubkey: src_buyer_ata,
                is_signer: false,
                is_writable: true,
            }, // src_buyer_ata
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

pub fn receive_offer_accepted(ctx: &mut Context<LzReceive>, message: &Vec<u8>) -> Result<()> {
    let (offer_id, src_amount_sd, src_buyer_address, dst_buyer_address, _) =
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
            ctx.accounts.src_actor.as_ref(),
            ctx.accounts.token_program.as_ref(),
            ctx.accounts.src_escrow_ata.as_deref(),
            src_token_mint,
            ctx.accounts.src_actor_ata.as_deref(),
            Some(&[&[Escrow::ESCROW_SEED, &[escrow.bump]]])
        )?;
    }

    Ok(())
}
