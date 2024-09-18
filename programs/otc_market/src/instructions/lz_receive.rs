use crate::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked},
};
use oapp::endpoint::{
    cpi::accounts::Clear,
    instructions::{ClearParams, SendComposeParams},
    ConstructCPIContext,
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceive<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        seeds = [
            &params.message[1..33],
        ],
        space = 8 + Offer::INIT_SPACE,
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    pub system_program: Program<'info, System>,
}

impl LzReceive<'_> {
    pub fn apply(ctx: &mut Context<LzReceive>, params: &LzReceiveParams) -> Result<()> {
        msg!("Hello in receive");

        const ERROR: &'static str = "Slice with incorrect length";
        let offer: Offer = Offer {
            src_seller_address: params.message[33..65].try_into().expect(&ERROR),
            dst_seller_address: params.message[65..97].try_into().expect(&ERROR),
            src_eid: u32::from_be_bytes(params.message[97..101].try_into().expect(&ERROR)),
            dst_eid: u32::from_be_bytes(params.message[101..105].try_into().expect(&ERROR)),
            src_token_address: params.message[105..137].try_into().expect(&ERROR),
            dst_token_address: params.message[137..169].try_into().expect(&ERROR),
            src_amount_sd: u64::from_be_bytes(params.message[169..177].try_into().expect(&ERROR)),
            exchange_rate_sd: u64::from_be_bytes(
                params.message[177..185].try_into().expect(&ERROR),
            ),

            bump: ctx.bumps.offer,
        };

        // store, hash offer
        let offer_id = ctx.accounts.offer.init(&offer); // more efficient that set_inner

        let seeds: &[&[u8]] = &[OtcConfig::OTC_SEED, &[ctx.accounts.otc_config.bump]];

        let accounts_for_clear = &ctx.remaining_accounts[0..Clear::MIN_ACCOUNTS_LEN];
        let _ = oapp::endpoint_cpi::clear(
            ctx.accounts.otc_config.endpoint_program,
            ctx.accounts.otc_config.key(),
            accounts_for_clear,
            seeds,
            ClearParams {
                receiver: ctx.accounts.otc_config.key(),
                src_eid: params.src_eid,
                sender: params.sender,
                nonce: params.nonce,
                guid: params.guid,
                message: params.message.clone(),
            },
        )?;

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
        msg!("Receive done");

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offer_encoding_decoding() {
        // Create a sample offer
        let offer_id = [9u8; 32];
        let offer = Offer {
            src_seller_address: [1u8; 32],
            dst_seller_address: [2u8; 32],
            src_eid: 123u32,
            dst_eid: 456u32,
            src_token_address: [3u8; 32],
            dst_token_address: [4u8; 32],
            src_amount_sd: 1000u64,
            exchange_rate_sd: 500u64,
            bump: 8u8,
        };
        const ERROR: &'static str = "Slice with incorrect length";

        let payload = build_create_offer_payload(&offer_id, &offer);

        assert_eq!(
            <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[1..33]).expect(&ERROR),
            [9u8; 32]
        );
        assert_eq!(
            <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[33..65]).expect(&ERROR),
            [1u8; 32]
        );
        assert_eq!(
            <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[65..97]).expect(&ERROR),
            [2u8; 32]
        );
        assert_eq!(
            u32::from_be_bytes(payload[97..101].try_into().expect(&ERROR)),
            123u32
        );
        assert_eq!(
            u32::from_be_bytes(payload[101..105].try_into().expect(&ERROR)),
            456u32
        );
        assert_eq!(
            <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[105..137]).expect(&ERROR),
            [3u8; 32]
        );
        assert_eq!(
            <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[137..169]).expect(&ERROR),
            [4u8; 32]
        );
        assert_eq!(
            u64::from_be_bytes(payload[169..177].try_into().expect(&ERROR)),
            1000u64
        );
        assert_eq!(
            u64::from_be_bytes(payload[177..185].try_into().expect(&ERROR)),
            500u64
        );
    }
}
