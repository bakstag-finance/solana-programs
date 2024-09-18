use crate::*;
use oapp::endpoint::{cpi::accounts::Clear, instructions::ClearParams, ConstructCPIContext};

#[event_cpi]
#[derive(Accounts)]
#[instruction(params: LzReceiveParams)]
pub struct LzReceive<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Peer::PEER_SEED,
            otc_config.key().as_ref(),
            &params.src_eid.to_be_bytes()
        ],
        bump = peer.bump,
        constraint = peer.address == params.sender @OtcError::InvalidSender
    )]
    pub peer: Account<'info, Peer>,

    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        init,
        payer = payer,
        seeds = [&offer_id(&params.message)],
        space = 8 + Offer::INIT_SPACE,
        bump
    )]
    pub offer: Account<'info, Offer>,

    pub system_program: Program<'info, System>,
}

impl LzReceive<'_> {
    pub fn apply(ctx: &mut Context<LzReceive>, params: &LzReceiveParams) -> Result<()> {
        let msg_type = get_message_type(&params.message)?;

        match msg_type {
            Message::OfferCreated => {
                receive_offer_created(ctx, &params.message)?;
            }
            _ => (),
        };

        // clear
        oapp::endpoint_cpi::clear(
            ctx.accounts.otc_config.endpoint_program,
            ctx.accounts.otc_config.key(),
            &ctx.remaining_accounts[0..Clear::MIN_ACCOUNTS_LEN],
            &[OtcConfig::OTC_SEED, &[ctx.accounts.otc_config.bump]],
            ClearParams {
                receiver: ctx.accounts.otc_config.key(),
                src_eid: params.src_eid,
                sender: params.sender,
                nonce: params.nonce,
                guid: params.guid,
                message: params.message.clone(),
            },
        )?;

        Ok(())
    }
}

// #[cfg(test)]
// mod tests {
//     use super::*;

//     #[test]
//     fn test_offer_encoding_decoding() {
//         // Create a sample offer
//         let offer_id = [9u8; 32];
//         let offer = Offer {
//             src_seller_address: [1u8; 32],
//             dst_seller_address: [2u8; 32],
//             src_eid: 123u32,
//             dst_eid: 456u32,
//             src_token_address: [3u8; 32],
//             dst_token_address: [4u8; 32],
//             src_amount_sd: 1000u64,
//             exchange_rate_sd: 500u64,
//             bump: 8u8,
//         };
//         const ERROR: &'static str = "Slice with incorrect length";

//         let payload = build_create_offer_payload(&offer_id, &offer);

//         assert_eq!(
//             <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[1..33]).expect(&ERROR),
//             [9u8; 32]
//         );
//         assert_eq!(
//             <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[33..65]).expect(&ERROR),
//             [1u8; 32]
//         );
//         assert_eq!(
//             <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[65..97]).expect(&ERROR),
//             [2u8; 32]
//         );
//         assert_eq!(u32::from_be_bytes(payload[97..101].try_into().expect(&ERROR)), 123u32);
//         assert_eq!(u32::from_be_bytes(payload[101..105].try_into().expect(&ERROR)), 456u32);
//         assert_eq!(
//             <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[105..137]).expect(&ERROR),
//             [3u8; 32]
//         );
//         assert_eq!(
//             <&[u8] as TryInto<Vec<u8>>>::try_into(&payload[137..169]).expect(&ERROR),
//             [4u8; 32]
//         );
//         assert_eq!(u64::from_be_bytes(payload[169..177].try_into().expect(&ERROR)), 1000u64);
//         assert_eq!(u64::from_be_bytes(payload[177..185].try_into().expect(&ERROR)), 500u64);
//     }
// }
