// SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;
use primitive_types::U256;

use crate::error::ErrorCode;

/**
 * @dev A 256-bit signed integer implementation using U256 as underlying storage.
 * Uses two's complement representation, same as Solidity's int256.
 * 
 * Range: -2^255 to 2^255 - 1
 */
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct I256 {
    /// Internal storage as unsigned 256-bit integer (two's complement)
    pub value: U256,
}

impl I256 {
    /// Zero value
    pub const ZERO: I256 = I256 {
        value: U256([0, 0, 0, 0]),
    };

    /// Minimum value: -2^255
    pub const MIN: I256 = I256 {
        value: U256([0, 0, 0, 0x8000000000000000]),
    };

    /// Maximum value: 2^255 - 1
    pub const MAX: I256 = I256 {
        value: U256([0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0x7FFFFFFFFFFFFFFF]),
    };

    /**
     * @dev Creates a new I256 from a U256 value (assumes two's complement representation)
     */
    pub fn from_raw(value: U256) -> Self {
        I256 { value }
    }

    /**
     * @dev Returns the raw U256 value (two's complement representation)
     */
    pub fn as_raw(&self) -> U256 {
        self.value
    }

    pub fn as_u64(&self) -> u64 {
        self.value.as_u64()
    }

    /**
     * @dev Checks if the value is negative
     */
    pub fn is_negative(&self) -> bool {
        // Check the sign bit: value >= 2^255 means negative in two's complement
        let sign_bit = U256([0, 0, 0, 0x8000000000000000]);
        self.value >= sign_bit
    }

    /**
     * @dev Returns the absolute value
     */
    pub fn abs(&self) -> Result<U256> {
        if self.is_negative() {
            // Two's complement: invert and add 1
            let inverted = !self.value;
            Ok(inverted + U256::one())
        } else {
            Ok(self.value)
        }
    }


    /**
     * @dev Checked multiplication, returns Result instead of panicking
     */
    pub fn checked_mul(&self, other: &Self) -> Result<Self> {
        // For simplicity, convert to absolute values, multiply, then apply sign
        let self_abs = self.abs()?;
        let other_abs = other.abs()?;
        
        let abs_product = self_abs.checked_mul(other_abs).ok_or(ErrorCode::MathOverflow)?;
        
        // Check if result fits in int256 range
        let max_abs = Self::MIN.abs()?;
        require!(abs_product <= max_abs, ErrorCode::MathOverflow);
        
        let self_neg = self.is_negative();
        let other_neg = other.is_negative();
        let result_neg = self_neg != other_neg;
        
        if result_neg {
            // Negative result: convert to two's complement
            let complement = U256::MAX - abs_product + U256::one();
            Ok(I256 { value: complement })
        } else {
            // Positive result
            Ok(I256 { value: abs_product })
        }
    }

    /**
     * @dev Checked division, returns Result instead of panicking
     */
    pub fn checked_div(&self, other: &Self) -> Result<Self> {
        require!(!other.value.is_zero(), ErrorCode::MathOverflow);
        
        // Handle MIN / -1 case (would overflow)
        if self.value == Self::MIN.value && other.value == U256::one() && other.is_negative() {
            return Err(ErrorCode::MathOverflow.into());
        }
        
        let self_abs = self.abs()?;
        let other_abs = other.abs()?;
        
        let quotient = self_abs / other_abs;
        
        let self_neg = self.is_negative();
        let other_neg = other.is_negative();
        let result_neg = self_neg != other_neg;
        
        if result_neg {
            // Negative result: convert to two's complement
            let complement = U256::MAX - quotient + U256::one();
            Ok(I256 { value: complement })
        } else {
            // Positive result
            Ok(I256 { value: quotient })
        }
    }

    /**
     * @dev Checked negation, returns Result instead of panicking
     */
    pub fn checked_neg(&self) -> Result<Self> {
        if self.value == Self::MIN.value {
            return Err(ErrorCode::MathOverflow.into());
        }
        // Two's complement negation: invert and add 1
        let inverted = !self.value;
        Ok(I256 {
            value: inverted + U256::one(),
        })
    }

    /**
     * @dev Converts I256 to U256 (only works for non-negative values)
     */
    pub fn to_u256(&self) -> Result<U256> {
        require!(!self.is_negative(), ErrorCode::MathOverflow);
        Ok(self.value)
    }
}

impl Default for I256 {
    fn default() -> Self {
        Self::ZERO
    }
}

use core::ops::{Add, Sub, Mul, Div, Neg, Rem, AddAssign, SubAssign, MulAssign, DivAssign};
use core::convert::{From, TryFrom};
use std::iter::Sum;
use core::cmp::{PartialOrd, Ord, Ordering};

/**
 * @dev Negation operator
 */
impl Neg for I256 {
    type Output = Self;

    fn neg(self) -> Self::Output {
        if self.value == Self::MIN.value {
            panic!("I256: negation overflow");
        }
        // Two's complement negation: invert and add 1
        let inverted = !self.value;
        I256 {
            value: inverted + U256::one(),
        }
    }
}

/**
 * @dev Addition operator
 * 直接使用补码运算，不依赖 U256::checked_add
 * 在补码系统中，加法可以直接在无符号数上进行，然后检查溢出
 */
impl Add for I256 {
    type Output = Self;

    fn add(self, other: Self) -> Self::Output {
        let self_neg = self.is_negative();
        let other_neg = other.is_negative();
        
        // 直接使用补码加法：result = self.value + other.value
        // 在补码系统中，加法可以直接在无符号数上进行
        // 使用 checked_add 来避免 panic，如果溢出则手动处理
        let result_value = match self.value.checked_add(other.value) {
            Some(r) => r,
            None => {
                // U256 加法溢出，需要手动计算
                if self_neg == other_neg {
                    // 同号相加导致 U256 溢出
                    if self_neg {
                        // 两个负数相加，检查是否会溢出到正数范围
                        // 计算绝对值之和
                        let self_abs = self.abs().expect("abs");
                        let other_abs = other.abs().expect("abs");
                        let sum_abs = self_abs + other_abs;
                        // 检查是否超过 |MIN|
                        let max_negative_abs = Self::MIN.abs().expect("MIN abs");
                        if sum_abs > max_negative_abs {
                            panic!("I256: addition overflow");
                        }
                        // 转换为补码：U256::MAX - sum_abs + 1
                        U256::MAX - sum_abs + U256::one()
                    } else {
                        // 两个正数相加，U256 溢出意味着 int256 溢出
                        panic!("I256: addition overflow");
                    }
                } else {
                    // 异号相加，U256 溢出是正常的，需要手动计算
                    // 计算绝对值差
                    let self_abs = self.abs().expect("abs");
                    let other_abs = other.abs().expect("abs");
                    
                    if self_abs >= other_abs {
                        // 结果的符号与 self 相同
                        let diff = self_abs - other_abs;
                        if self_neg {
                            // 结果为负，转换为补码
                            U256::MAX - diff + U256::one()
                        } else {
                            // 结果为正
                            diff
                        }
                    } else {
                        // 结果的符号与 other 相同
                        let diff = other_abs - self_abs;
                        if other_neg {
                            // 结果为负，转换为补码
                            U256::MAX - diff + U256::one()
                        } else {
                            // 结果为正
                            diff
                        }
                    }
                }
            }
        };
        
        let result = I256 { value: result_value };
        let result_neg = result.is_negative();
        
        // 检查溢出：
        // 1. 正数 + 正数 = 负数 -> 溢出
        // 2. 负数 + 负数 = 正数 -> 溢出
        // 3. 正数 + 负数 或 负数 + 正数 -> 不会溢出（除非结果超出范围，但这种情况已经被上面的检查覆盖）
        if (self_neg == false && other_neg == false && result_neg) ||
           (self_neg == true && other_neg == true && !result_neg) {
            panic!("I256: addition overflow");
        }
        
        result
    }
}

/**
 * @dev Subtraction operator
 */
impl Sub for I256 {
    type Output = Self;

    fn sub(self, other: Self) -> Self::Output {
        // a - b = a + (-b)
        self + (-other)
    }
}

impl Sum for I256 {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::ZERO, |a, b| a + b)
    }
}

/**
 * @dev Multiplication operator
 */
impl Mul for I256 {
    type Output = Self;

    fn mul(self, other: Self) -> Self::Output {
        // For simplicity, convert to absolute values, multiply, then apply sign
        let self_abs = self.abs().expect("I256: abs overflow");
        let other_abs = other.abs().expect("I256: abs overflow");
        
        let abs_product = self_abs.checked_mul(other_abs)
            .expect("I256: multiplication overflow");
        
        // Check if result fits in int256 range
        let max_abs = Self::MIN.abs().expect("I256: abs overflow");
        if abs_product > max_abs {
            panic!("I256: multiplication overflow");
        }
        
        let self_neg = self.is_negative();
        let other_neg = other.is_negative();
        let result_neg = self_neg != other_neg;
        
        if result_neg {
            // Negative result: convert to two's complement
            let complement = U256::MAX - abs_product + U256::one();
            I256 { value: complement }
        } else {
            // Positive result
            I256 { value: abs_product }
        }
    }
}

/**
 * @dev Division operator
 */
impl Div for I256 {
    type Output = Self;

    fn div(self, other: Self) -> Self::Output {
        if other.value.is_zero() {
            panic!("I256: division by zero");
        }
        
        // Handle MIN / -1 case (would overflow)
        // MIN in two's complement is 0x8000000000000000...
        // -1 in two's complement is 0xFFFFFFFFFFFFFFFF...
        // Check if self is MIN and other is -1
        if self.value == Self::MIN.value {
            let neg_one = I256::try_from(-1i128).unwrap();
            if other.value == neg_one.value {
                panic!("I256: division overflow");
            }
        }
        
        let self_abs = self.abs().expect("I256: abs overflow");
        let other_abs = other.abs().expect("I256: abs overflow");
        
        let quotient = self_abs / other_abs;
        
        let self_neg = self.is_negative();
        let other_neg = other.is_negative();
        let result_neg = self_neg != other_neg;
        
        if result_neg {
            // Negative result: convert to two's complement
            let complement = U256::MAX - quotient + U256::one();
            I256 { value: complement }
        } else {
            // Positive result
            I256 { value: quotient }
        }
    }
}

/**
 * @dev Remainder operator (%)
 */
impl Rem for I256 {
    type Output = Self;

    fn rem(self, other: Self) -> Self::Output {
        if other.value.is_zero() {
            panic!("I256: remainder by zero");
        }
        
        let self_abs = self.abs().expect("I256: abs overflow");
        let other_abs = other.abs().expect("I256: abs overflow");
        
        let remainder = self_abs % other_abs;
        
        // Remainder has the same sign as the dividend
        if self.is_negative() {
            // Negative result: convert to two's complement
            let complement = U256::MAX - remainder + U256::one();
            I256 { value: complement }
        } else {
            // Positive result
            I256 { value: remainder }
        }
    }
}

/**
 * @dev AddAssign operator (+=)
 */
impl AddAssign for I256 {
    fn add_assign(&mut self, other: Self) {
        *self = *self + other;
    }
}

/**
 * @dev SubAssign operator (-=)
 */
impl SubAssign for I256 {
    fn sub_assign(&mut self, other: Self) {
        *self = *self - other;
    }
}

/**
 * @dev MulAssign operator (*=)
 */
impl MulAssign for I256 {
    fn mul_assign(&mut self, other: Self) {
        *self = *self * other;
    }
}

/**
 * @dev DivAssign operator (/=)
 */
impl DivAssign for I256 {
    fn div_assign(&mut self, other: Self) {
        *self = *self / other;
    }
}


/**
 * @dev From i128 (const version for compile-time constants)
 * Note: This function can only handle values that fit in u64 for const context
 */
impl I256 {
    pub const fn from_i128_const(value: i128) -> Self {
        if value >= 0 {
            // For positive values, construct U256 directly
            let u64_value = value as u64;
            I256 {
                value: U256([u64_value, 0, 0, 0]),
            }
        } else {
            // Convert negative i128 to two's complement U256
            // For const context, we can only handle values that fit in u64
            let abs_value = (-value) as u64;
            // U256::MAX - abs_u256 + U256::one() in const context
            // U256::MAX = [0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF]
            // U256::one() = [1, 0, 0, 0]
            // For values that fit in u64, we only need to modify the first u64
            let complement_low = 0xFFFFFFFFFFFFFFFFu64 - abs_value + 1;
            I256 {
                value: U256([complement_low, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF]),
            }
        }
    }
}

/**
 * @dev From i128
 */
impl From<i128> for I256 {
    fn from(value: i128) -> Self {
        Self::from_i128_const(value)
    }
}

impl From<u64> for I256 {
    fn from(value: u64) -> Self {
        I256 { value: U256::from(value) }
    }
}

/**
 * @dev From u128 (only works for values <= 2^127 - 1)
 */
impl TryFrom<u128> for I256 {
    type Error = anchor_lang::error::Error;

    fn try_from(value: u128) -> Result<Self> {
        if value > i128::MAX as u128 {
            return Err(ErrorCode::MathOverflow.into());
        }
        Ok(I256 {
            value: U256::from(value),
        })
    }
}

/**
 * @dev From U256 (only works for values <= 2^255 - 1)
 */
impl TryFrom<U256> for I256 {
    type Error = anchor_lang::error::Error;

    fn try_from(value: U256) -> Result<Self> {
        // Check if value fits in positive int256 range
        let max_positive = U256([0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0x7FFFFFFFFFFFFFFF]);
        require!(value <= max_positive, ErrorCode::MathOverflow);
        Ok(I256 { value })
    }
}

/**
 * @dev Into U256 (only works for non-negative values)
 */
impl TryFrom<I256> for U256 {
    type Error = anchor_lang::error::Error;

    fn try_from(value: I256) -> Result<Self> {
        require!(!value.is_negative(), ErrorCode::MathOverflow);
        Ok(value.value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use primitive_types::U256;

    #[test]
    fn test_add_positive() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let b = I256::try_from(U256::from(200u64)).unwrap();
        let result = a + b;
        assert_eq!(result.value, U256::from(300u64));
    }

    #[test]
    fn test_add_negative() {
        let a = I256::try_from(-100i128).unwrap();
        let b = I256::try_from(-200i128).unwrap();
        let result = a + b;
        assert!(result.is_negative());
    }

    #[test]
    fn test_add_mixed() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let b = I256::try_from(-50i128).unwrap();
        let result = a + b;
        assert_eq!(result.value, U256::from(50u64));
    }

    #[test]
    #[should_panic(expected = "I256: addition overflow")]
    fn test_add_overflow_positive() {
        let max = I256::MAX;
        let one = I256::try_from(U256::from(1u64)).unwrap();
        let _ = max + one;
    }

    #[test]
    #[should_panic(expected = "I256: addition overflow")]
    fn test_add_overflow_negative() {
        let min = I256::MIN;
        let neg_one = I256::try_from(-1i128).unwrap();
        let _ = min + neg_one;
    }

    #[test]
    fn test_sub_positive() {
        let a = I256::try_from(U256::from(200u64)).unwrap();
        let b = I256::try_from(U256::from(100u64)).unwrap();
        let result = a - b;
        assert_eq!(result.value, U256::from(100u64));
    }

    #[test]
    fn test_sub_negative() {
        let a = I256::try_from(-100i128).unwrap();
        let b = I256::try_from(-200i128).unwrap();
        let result = a - b;
        assert_eq!(result.value, U256::from(100u64));
    }

    #[test]
    fn test_sub_mixed() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let b = I256::try_from(-50i128).unwrap();
        let result = a - b;
        assert_eq!(result.value, U256::from(150u64));
    }

    #[test]
    #[should_panic(expected = "I256: addition overflow")]
    fn test_sub_overflow() {
        let min = I256::MIN;
        let one = I256::try_from(U256::from(1u64)).unwrap();
        // min - one = min + (-one) should overflow
        let _ = min - one;
    }

    #[test]
    fn test_mul_positive() {
        let a = I256::try_from(U256::from(10u64)).unwrap();
        let b = I256::try_from(U256::from(20u64)).unwrap();
        let result = a * b;
        assert_eq!(result.value, U256::from(200u64));
    }

    #[test]
    fn test_mul_negative() {
        let a = I256::try_from(-10i128).unwrap();
        let b = I256::try_from(-20i128).unwrap();
        let result = a * b;
        assert_eq!(result.value, U256::from(200u64));
    }

    #[test]
    fn test_mul_mixed() {
        let a = I256::try_from(U256::from(10u64)).unwrap();
        let b = I256::try_from(-20i128).unwrap();
        let result = a * b;
        assert!(result.is_negative());
        assert_eq!(result.abs().unwrap(), U256::from(200u64));
    }

    #[test]
    #[should_panic(expected = "I256: multiplication overflow")]
    fn test_mul_overflow() {
        let max = I256::MAX;
        let two = I256::try_from(U256::from(2u64)).unwrap();
        let _ = max * two;
    }

    #[test]
    fn test_div_positive() {
        let a = I256::try_from(U256::from(200u64)).unwrap();
        let b = I256::try_from(U256::from(10u64)).unwrap();
        let result = a / b;
        assert_eq!(result.value, U256::from(20u64));
    }

    #[test]
    fn test_div_negative() {
        let a = I256::try_from(-200i128).unwrap();
        let b = I256::try_from(-10i128).unwrap();
        let result = a / b;
        assert_eq!(result.value, U256::from(20u64));
    }

    #[test]
    fn test_div_mixed() {
        let a = I256::try_from(U256::from(200u64)).unwrap();
        let b = I256::try_from(-10i128).unwrap();
        let result = a / b;
        assert!(result.is_negative());
        assert_eq!(result.abs().unwrap(), U256::from(20u64));
    }

    #[test]
    #[should_panic(expected = "I256: division by zero")]
    fn test_div_by_zero() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let zero = I256::ZERO;
        let _ = a / zero;
    }

    #[test]
    #[should_panic(expected = "I256: division overflow")]
    fn test_div_overflow() {
        let min = I256::MIN;
        let neg_one = I256::try_from(-1i128).unwrap();
        // MIN / -1 should overflow
        let _ = min / neg_one;
    }

    #[test]
    fn test_neg_positive() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let result = -a;
        assert!(result.is_negative());
        assert_eq!(result.abs().unwrap(), U256::from(100u64));
    }

    #[test]
    fn test_neg_negative() {
        let a = I256::try_from(-100i128).unwrap();
        let result = -a;
        assert!(!result.is_negative());
        assert_eq!(result.value, U256::from(100u64));
    }

    #[test]
    #[should_panic(expected = "I256: negation overflow")]
    fn test_neg_overflow() {
        let min = I256::MIN;
        // -MIN should overflow
        let _ = -min;
    }

    #[test]
    fn test_rem_positive() {
        let a = I256::try_from(U256::from(17u64)).unwrap();
        let b = I256::try_from(U256::from(5u64)).unwrap();
        let result = a % b;
        assert_eq!(result.value, U256::from(2u64));
    }

    #[test]
    fn test_rem_negative() {
        let a = I256::try_from(-17i128).unwrap();
        let b = I256::try_from(U256::from(5u64)).unwrap();
        let result = a % b;
        assert!(result.is_negative());
    }

    #[test]
    #[should_panic(expected = "I256: remainder by zero")]
    fn test_rem_by_zero() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let zero = I256::ZERO;
        let _ = a % zero;
    }


    #[test]
    fn test_checked_mul_success() {
        let a = I256::try_from(U256::from(10u64)).unwrap();
        let b = I256::try_from(U256::from(20u64)).unwrap();
        let result = a.checked_mul(&b).unwrap();
        assert_eq!(result.value, U256::from(200u64));
    }

    #[test]
    fn test_checked_mul_overflow() {
        let max = I256::MAX;
        let two = I256::try_from(U256::from(2u64)).unwrap();
        let result = max.checked_mul(&two);
        assert!(result.is_err());
    }

    #[test]
    fn test_checked_div_success() {
        let a = I256::try_from(U256::from(200u64)).unwrap();
        let b = I256::try_from(U256::from(10u64)).unwrap();
        let result = a.checked_div(&b).unwrap();
        assert_eq!(result.value, U256::from(20u64));
    }

    #[test]
    fn test_checked_div_by_zero() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let zero = I256::ZERO;
        let result = a.checked_div(&zero);
        assert!(result.is_err());
    }

    #[test]
    fn test_checked_neg_success() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let result = a.checked_neg().unwrap();
        assert!(result.is_negative());
    }

    #[test]
    fn test_checked_neg_overflow() {
        let min = I256::MIN;
        let result = min.checked_neg();
        assert!(result.is_err());
    }

    #[test]
    fn test_from_i128() {
        let a: I256 = 100i128.into();
        assert_eq!(a.value, U256::from(100u64));
        
        let b: I256 = (-100i128).into();
        assert!(b.is_negative());
    }

    #[test]
    fn test_try_from_u128() {
        let a = I256::try_from(100u128).unwrap();
        assert_eq!(a.value, U256::from(100u64));
        
        let result = I256::try_from(i128::MAX as u128 + 1);
        assert!(result.is_err());
    }

    #[test]
    fn test_try_from_u256() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        assert_eq!(a.value, U256::from(100u64));
        
        let max_positive = U256([0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0x7FFFFFFFFFFFFFFF]);
        let result = I256::try_from(max_positive);
        assert!(result.is_ok());
        
        let overflow = U256([0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0x8000000000000000]);
        let result = I256::try_from(overflow);
        assert!(result.is_err());
    }

    #[test]
    fn test_to_u256() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let u = a.to_u256().unwrap();
        assert_eq!(u, U256::from(100u64));
        
        let neg = I256::try_from(-100i128).unwrap();
        let result = neg.to_u256();
        assert!(result.is_err());
    }

    #[test]
    fn test_is_negative() {
        let pos = I256::try_from(U256::from(100u64)).unwrap();
        assert!(!pos.is_negative());
        
        let neg = I256::try_from(-100i128).unwrap();
        assert!(neg.is_negative());
        
        let zero = I256::ZERO;
        assert!(!zero.is_negative());
    }

    #[test]
    fn test_abs() {
        let pos = I256::try_from(U256::from(100u64)).unwrap();
        assert_eq!(pos.abs().unwrap(), U256::from(100u64));
        
        let neg = I256::try_from(-100i128).unwrap();
        assert_eq!(neg.abs().unwrap(), U256::from(100u64));
    }

    #[test]
    fn test_comparison() {
        let a = I256::try_from(U256::from(100u64)).unwrap();
        let b = I256::try_from(U256::from(200u64)).unwrap();
        assert!(a < b);
        assert!(b > a);
        assert!(a != b);
        
        let c = I256::try_from(U256::from(100u64)).unwrap();
        assert!(a == c);
    }

    #[test]
    fn test_add_assign() {
        let mut a = I256::try_from(U256::from(100u64)).unwrap();
        let b = I256::try_from(U256::from(50u64)).unwrap();
        a += b;
        assert_eq!(a.value, U256::from(150u64));
    }

    #[test]
    fn test_sub_assign() {
        let mut a = I256::try_from(U256::from(100u64)).unwrap();
        let b = I256::try_from(U256::from(50u64)).unwrap();
        a -= b;
        assert_eq!(a.value, U256::from(50u64));
    }

    #[test]
    fn test_mul_assign() {
        let mut a = I256::try_from(U256::from(10u64)).unwrap();
        let b = I256::try_from(U256::from(5u64)).unwrap();
        a *= b;
        assert_eq!(a.value, U256::from(50u64));
    }

    #[test]
    fn test_div_assign() {
        let mut a = I256::try_from(U256::from(100u64)).unwrap();
        let b = I256::try_from(U256::from(5u64)).unwrap();
        a /= b;
        assert_eq!(a.value, U256::from(20u64));
    }
}

/**
 * @dev Into i128 (may lose precision for values outside i128 range)
 */
impl TryFrom<I256> for i128 {
    type Error = anchor_lang::error::Error;

    fn try_from(value: I256) -> Result<Self> {
        if value.is_negative() {
            // Two's complement: invert and add 1
            let inverted = !value.value;
            let abs = inverted + U256::one();
            // Check if abs fits in u128
            if abs > U256::from(u128::MAX) {
                return Err(ErrorCode::MathOverflow.into());
            }
            // Convert to u128 then to i128
            let abs_u128 = u128::try_from(abs).map_err(|_| ErrorCode::MathOverflow)?;
            if abs_u128 > (i128::MAX as u128) + 1 {
                return Err(ErrorCode::MathOverflow.into());
            }
            Ok(-(abs_u128 as i128))
        } else {
            // Check if value fits in u128
            if value.value > U256::from(u128::MAX) {
                return Err(ErrorCode::MathOverflow.into());
            }
            let low = u128::try_from(value.value).map_err(|_| ErrorCode::MathOverflow)?;
            if low > i128::MAX as u128 {
                return Err(ErrorCode::MathOverflow.into());
            }
            Ok(low as i128)
        }
    }
}

/**
 * @dev Partial ordering for signed integers
 */
impl PartialOrd for I256 {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/**
 * @dev Total ordering for signed integers
 */
impl Ord for I256 {
    fn cmp(&self, other: &Self) -> Ordering {
        // Compare as two's complement: negative numbers are "larger" in unsigned representation
        let self_neg = self.is_negative();
        let other_neg = other.is_negative();
        
        if self_neg != other_neg {
            // Different signs: negative is less than positive
            if self_neg {
                Ordering::Less
            } else {
                Ordering::Greater
            }
        } else {
            // Same sign: compare as unsigned
            self.value.cmp(&other.value)
        }
    }
}


