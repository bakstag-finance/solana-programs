use anchor_lang::prelude::error_code;

#[error_code]
pub enum OtcError {
    Unauthorized,
    InvalidLocalDecimals,
    InvalidPricing,
    ExcessiveAmount,
    InvalidEid,
    InvalidSrcTokenMint,
    InvalidDstTokenMint,
    InvalidDstSeller,
    InvalidTreasury,
    OnlySeller,
    InvalidSender,
    InvalidMessageType,
    InvalidSrcBuyer,
    NotCrosschainOffer,
}
