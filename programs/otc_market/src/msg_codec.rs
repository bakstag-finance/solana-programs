use crate::Offer;

#[repr(u8)]
enum Message {
    OfferCreated = 0,
    OfferAccepted = 1,
    // OfferCancelOrder = 2,
    // OfferCanceled = 3,
}

pub fn build_create_offer_payload(offer_id: &[u8; 32], offer: &Offer) -> Vec<u8> {
    // let mut msg_payload = Vec::new();
    // msg_payload.extend_from_slice(offer_id);
    // msg_payload.extend_from_slice(src_seller_address);
    // msg_payload.extend_from_slice(dst_seller_address);
    // msg_payload.extend_from_slice(&src_eid.to_be_bytes());
    // msg_payload.extend_from_slice(&dst_eid.to_be_bytes());
    // msg_payload.extend_from_slice(src_token_address);
    // msg_payload.extend_from_slice(dst_token_address);
    // msg_payload.extend_from_slice(&src_amount_sd.to_be_bytes());
    // msg_payload.extend_from_slice(&exchange_rate_sd.to_be_bytes());

    // let mut payload = Vec::new();
    // payload.extend_from_slice(&(Message::OfferCreated as u8).to_be_bytes());
    // payload.extend_from_slice(&msg_payload);
    // payload

    [
        &(Message::OfferCreated as u8).to_be_bytes() as &[u8],
        offer_id,
        &offer.src_seller_address,
        &offer.dst_seller_address,
        &offer.src_eid.to_be_bytes(),
        &offer.dst_eid.to_be_bytes(),
        &offer.src_token_address,
        &offer.dst_token_address,
        &offer.src_amount_sd.to_be_bytes(),
        &offer.exchange_rate_sd.to_be_bytes(),
    ].concat()
}

pub fn build_accept_offer_payload(
    offer_id: &[u8; 32],
    src_amount_sd: u64,
    src_buyer_address: &[u8; 32],
    dst_buyer_address: &[u8; 32]
) -> Vec<u8> {
    // let mut msg_payload = Vec::new();
    // msg_payload.extend_from_slice(&offer_id);
    // msg_payload.extend_from_slice(&src_amount_sd.to_be_bytes());
    // msg_payload.extend_from_slice(&src_buyer_address);
    // msg_payload.extend_from_slice(&dst_buyer_address);

    // let mut payload = Vec::new();
    // payload.extend_from_slice(&(Message::OfferAccepted as u8).to_be_bytes());
    // payload.extend_from_slice(&msg_payload);
    // payload

    [
        &(Message::OfferAccepted as u8).to_be_bytes() as &[u8],
        offer_id,
        &src_amount_sd.to_be_bytes(),
        src_buyer_address,
        dst_buyer_address,
    ].concat()
}

pub fn offer_id(message: &[u8]) -> [u8; 32] {
    message[1..33].try_into().unwrap()
}

pub fn decode_offer_created(message: &[u8], bump: u8) -> Offer {
    Offer {
        src_seller_address: message[33..65].try_into().unwrap(),
        dst_seller_address: message[65..97].try_into().unwrap(),
        src_eid: u32::from_be_bytes(message[97..101].try_into().unwrap()),
        dst_eid: u32::from_be_bytes(message[101..105].try_into().unwrap()),
        src_token_address: message[105..137].try_into().unwrap(),
        dst_token_address: message[137..169].try_into().unwrap(),
        src_amount_sd: u64::from_be_bytes(message[169..177].try_into().unwrap()),
        exchange_rate_sd: u64::from_be_bytes(message[177..185].try_into().unwrap()),

        bump,
    }
}
