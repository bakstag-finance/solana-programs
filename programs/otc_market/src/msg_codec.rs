use crate::{ Offer, OtcError };

#[repr(u8)]
pub enum Message {
    OfferCreated = 0,
    OfferAccepted = 1,
    OfferCancelOrder = 2,
    OfferCanceled = 3,
}

impl TryFrom<u8> for Message {
    type Error = OtcError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Message::OfferCreated),
            1 => Ok(Message::OfferAccepted),
            2 => Ok(Message::OfferCancelOrder),
            3 => Ok(Message::OfferCanceled),
            _ => Err(OtcError::InvalidMessageType), // Return an error for unsupported values
        }
    }
}

pub fn build_create_offer_payload(offer_id: &[u8; 32], offer: &Offer) -> Vec<u8> {
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

pub fn build_cancel_offer_order_payload(offer_id: &[u8; 32]) -> Vec<u8> {
    [&(Message::OfferCancelOrder as u8).to_be_bytes() as &[u8], offer_id].concat()
}

pub fn build_cancel_offer_payload(offer_id: &[u8; 32]) -> Vec<u8> {
    [&(Message::OfferCanceled as u8).to_be_bytes() as &[u8], offer_id].concat()
}

pub fn build_accept_offer_payload(
    offer_id: &[u8; 32],
    src_amount_sd: u64,
    src_buyer_address: &[u8; 32],
    dst_buyer_address: &[u8; 32]
) -> Vec<u8> {
    [
        &(Message::OfferAccepted as u8).to_be_bytes() as &[u8],
        offer_id,
        &src_amount_sd.to_be_bytes(),
        src_buyer_address,
        dst_buyer_address,
    ].concat()
}

pub fn get_message_type(message: &[u8]) -> Result<Message, OtcError> {
    Message::try_from(u8::from_be_bytes(message[0..1].try_into().unwrap()))
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

pub fn src_buyer_address(message: &[u8]) -> [u8; 32] {
    message[41..73].try_into().unwrap()
}

pub fn decode_offer_accepted(message: &[u8]) -> ([u8; 32], u64, [u8; 32], [u8; 32], [u8; 32]) {
    (
        message[1..33].try_into().unwrap(),
        u64::from_be_bytes(message[33..41].try_into().unwrap()),
        message[41..73].try_into().unwrap(),
        message[73..105].try_into().unwrap(),
        message[105..137].try_into().unwrap(),
    )
}

pub fn decode_offer_cancel_order(message: &[u8]) -> [u8; 32] {
    offer_id(message)
}

pub fn decode_offer_canceled(message: &[u8]) -> ([u8; 32], [u8; 32], [u8; 32]) {
    (
        message[1..33].try_into().unwrap(),
        message[33..65].try_into().unwrap(),
        message[65..97].try_into().unwrap(),
    )
}

pub fn src_seller_address(message: &[u8]) -> [u8; 32] {
    message[33..65].try_into().unwrap()
}
