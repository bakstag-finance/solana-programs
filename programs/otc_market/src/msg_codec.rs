#[repr(u8)]
enum Message {
    OfferCreated = 0,
    OfferAccepted = 1,
    // OfferCancelOrder = 2,
    // OfferCanceled = 3,
}

pub fn build_create_offer_payload(
    offer_id: &[u8; 32],
    src_seller_address: &[u8; 32],
    dst_seller_address: &[u8; 32],
    src_eid: u32,
    dst_eid: u32,
    src_token_address: &[u8; 32],
    dst_token_address: &[u8; 32],
    src_amount_sd: u64,
    exchange_rate_sd: u64
) -> Vec<u8> {
    let mut msg_payload = Vec::new();
    msg_payload.extend_from_slice(offer_id);
    msg_payload.extend_from_slice(src_seller_address);
    msg_payload.extend_from_slice(dst_seller_address);
    msg_payload.extend_from_slice(&src_eid.to_be_bytes());
    msg_payload.extend_from_slice(&dst_eid.to_be_bytes());
    msg_payload.extend_from_slice(src_token_address);
    msg_payload.extend_from_slice(dst_token_address);
    msg_payload.extend_from_slice(&src_amount_sd.to_be_bytes());
    msg_payload.extend_from_slice(&exchange_rate_sd.to_be_bytes());

    let mut payload = Vec::new();
    payload.extend_from_slice(&(Message::OfferCreated as u8).to_be_bytes());
    payload.extend_from_slice(&msg_payload);
    payload

    // [
    //     &(Message::OfferCreated as u8).to_be_bytes() as &[u8],
    //     offer_id,
    //     src_seller_address,
    //     dst_seller_address,
    //     &src_eid.to_be_bytes(),
    //     &dst_eid.to_be_bytes(),
    //     src_token_address,
    //     dst_token_address,
    //     &src_amount_sd.to_be_bytes(),
    //     &exchange_rate_sd.to_be_bytes(),
    // ].concat()
}

pub fn build_accept_offer_payload(
    offer_id: [u8; 32],
    src_amount_sd: u64,
    src_buyer_address: [u8; 32],
    dst_buyer_address: [u8; 32]
) -> Vec<u8> {
    let mut msg_payload = Vec::new();
    msg_payload.extend_from_slice(&offer_id);
    msg_payload.extend_from_slice(&src_amount_sd.to_be_bytes());
    msg_payload.extend_from_slice(&src_buyer_address);
    msg_payload.extend_from_slice(&dst_buyer_address);

    let mut payload = Vec::new();
    payload.extend_from_slice(&(Message::OfferAccepted as u8).to_be_bytes());
    payload.extend_from_slice(&msg_payload);
    payload
}
