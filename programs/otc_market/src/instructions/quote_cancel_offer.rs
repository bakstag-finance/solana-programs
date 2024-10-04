use crate::*;
use oapp::endpoint::{ instructions::QuoteParams as EndpointQuoteParams, MessagingFee };

#[derive(Accounts)]
#[instruction(offer_id: [u8; 32])]
pub struct QuoteCancelOffer<'info> {
    #[account(seeds = [OtcConfig::OTC_SEED], bump = otc_config.bump)]
    pub otc_config: Account<'info, OtcConfig>,

    #[account(
        seeds = [&offer_id], bump = offer.bump,
        constraint = offer.dst_eid == OtcConfig::EID @ OtcError::InvalidEid,
        constraint = offer.src_eid != offer.dst_eid @ OtcError::NotCrosschainOffer
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        seeds = [Peer::PEER_SEED, otc_config.key().as_ref(), &offer.src_eid.to_be_bytes()],
        bump = peer.bump
    )]
    /// NOTICE: required for crosschain offer
    pub peer: Account<'info, Peer>,

    #[account(
        seeds = [
            EnforcedOptions::ENFORCED_OPTIONS_SEED,
            otc_config.key().as_ref(),
            &offer.src_eid.to_be_bytes(),
        ],
        bump = enforced_options.bump
    )]
    /// NOTICE: required for crosschain offer
    pub enforced_options: Account<'info, EnforcedOptions>,
}

impl QuoteCancelOffer<'_> {
    pub fn apply(ctx: &mut Context<QuoteCancelOffer>, offer_id: &[u8; 32]) -> Result<MessagingFee> {
        let payload = build_cancel_offer_payload(&offer_id);

        let messaging_fee = oapp::endpoint_cpi::quote(
            ctx.accounts.otc_config.endpoint_program,
            ctx.remaining_accounts,
            EndpointQuoteParams {
                sender: ctx.accounts.otc_config.key(),
                dst_eid: ctx.accounts.offer.dst_eid,
                receiver: ctx.accounts.peer.address,
                message: payload,
                pay_in_lz_token: false,
                options: ctx.accounts.enforced_options.get_enforced_options(&None),
            }
        )?;

        Ok(messaging_fee)
    }
}
