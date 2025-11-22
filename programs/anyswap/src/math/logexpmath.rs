// SPDX-License-Identifier: MIT
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
// Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

use anchor_lang::prelude::*;
use primitive_types::U256;

use crate::error::ErrorCode;
use super::i256::I256;

/* solhint-disable */

/**
 * @dev Exponentiation and logarithm functions for 18 decimal fixed point numbers (both base and exponent/argument).
 *
 * Exponentiation and logarithm with arbitrary bases (x^y and log_x(y)) are implemented by conversion to natural
 * exponentiation and logarithm (where the base is Euler's number).
 *
 * @author Fernando Martinelli - @fernandomartinelli
 * @author Sergio Yuhjtman - @sergioyuhjtman
 * @author Daniel Fernandez - @dmf7z
 */
pub struct LogExpMath;

    // All fixed point multiplications and divisions are inlined. This means we need to divide by ONE when multiplying
    // two numbers, and multiply by ONE when dividing them.

    // All arguments and return values are 18 decimal fixed point numbers.
// ONE_18 = 1e18 = 1_000_000_000_000_000_000
pub const ONE_18: I256 = I256 {
    value: U256([1_000_000_000_000_000_000u64, 0, 0, 0]),
};

    // Internally, intermediate values are computed with higher precision as 20 decimal fixed point numbers, and in the
    // case of ln36, 36 decimals.
// ONE_20 = 1e20 = 100_000_000_000_000_000_000
pub const ONE_20: I256 = I256 {
    value: U256([0x6bc75e2d63100000u64, 0x5, 0, 0]),
};

// ONE_36 = 1e36, which is too large for i128, so we construct it from U256
// ONE_36 = ONE_18 * ONE_18 = 1e18 * 1e18 = 1e36
pub const ONE_36: I256 = I256 {
    value: U256([0xb34b9f1000000000, 0x00c097ce7bc90715, 0, 0])
};

    // The domain of natural exponentiation is bound by the word size and number of decimals used.
    //
    // Because internally the result will be stored using 20 decimals, the largest possible result is
    // (2^255 - 1) / 10^20, which makes the largest exponent ln((2^255 - 1) / 10^20) = 130.700829182905140221.
    // The smallest possible result is 10^(-18), which makes largest negative argument
    // ln(10^(-18)) = -41.446531673892822312.
    // We use 130.0 and -41.0 to have some safety margin.
// MAX_NATURAL_EXPONENT = 130e18 = 130_000_000_000_000_000_000
pub const MAX_NATURAL_EXPONENT: I256 = I256 {
    value: U256([0x0c1cc73b00c80000u64, 0x7, 0, 0]),
};
// MIN_NATURAL_EXPONENT = -41e18 = -41_000_000_000_000_000_000
// In two's complement: U256::MAX - 41e18 + 1
pub const MIN_NATURAL_EXPONENT: I256 = I256 {
    value: U256([0xc702bd3a30fc0000u64, 0xfffffffffffffffd, 0xffffffffffffffff, 0xffffffffffffffff]),
};

    // Bounds for ln_36's argument. Both ln(0.9) and ln(1.1) can be represented with 36 decimal places in a fixed point
    // 256 bit integer.
// LN_36_LOWER_BOUND = 0.9e18 = 900_000_000_000_000_000
pub const LN_36_LOWER_BOUND: I256 = I256 {
    value: U256([0x0c7d713b49da0000u64, 0, 0, 0]),
};
// LN_36_UPPER_BOUND = 1.1e18 = 1_100_000_000_000_000_000
pub const LN_36_UPPER_BOUND: I256 = I256 {
    value: U256([0x0f43fc2c04ee0000u64, 0, 0, 0]),
};

    // 18 decimal constants
// X0 = 128e18 = 128_000_000_000_000_000_000 (2^7)
pub const X0: I256 = I256 {
    value: U256([0xf05b59d3b2000000u64, 0x6, 0, 0]),
};
// X1 = 64e18 = 64_000_000_000_000_000_000 (2^6)
pub const X1: I256 = I256 {
    value: U256([0x782dace9d9000000u64, 0x3, 0, 0]),
};

    // 20 decimal constants
// X2 = 3200e18 = 3_200_000_000_000_000_000_000 (2^5)
pub const X2: I256 = I256 {
    value: U256([0x78ebc5ac62000000u64, 0xad, 0, 0]),
};
// X3 = 1600e18 = 1_600_000_000_000_000_000_000 (2^4)
pub const X3: I256 = I256 {
    value: U256([0xbc75e2d631000000u64, 0x56, 0, 0]),
};
// X4 = 800e18 = 800_000_000_000_000_000_000 (2^3)
pub const X4: I256 = I256 {
    value: U256([0x5e3af16b18800000u64, 0x2b, 0, 0]),
};
// X5 = 400e18 = 400_000_000_000_000_000_000 (2^2)
pub const X5: I256 = I256 {
    value: U256([0xaf1d78b58c400000u64, 0x15, 0, 0]),
};
// X6 = 200e18 = 200_000_000_000_000_000_000 (2^1)
pub const X6: I256 = I256 {
    value: U256([0xd78ebc5ac6200000u64, 0xa, 0, 0]),
};
// X7 = 100e18 = 100_000_000_000_000_000_000 (2^0)
pub const X7: I256 = I256 {
    value: U256([0x6bc75e2d63100000u64, 0x5, 0, 0]),
};
// X8 = 50e18 = 50_000_000_000_000_000_000 (2^-1)
pub const X8: I256 = I256 {
    value: U256([0xb5e3af16b1880000u64, 0x2, 0, 0]),
};
// X9 = 25e18 = 25_000_000_000_000_000_000 (2^-2)
pub const X9: I256 = I256 {
    value: U256([0x5af1d78b58c40000u64, 0x1, 0, 0]),
};
// X10 = 12.5e18 = 12_500_000_000_000_000_000 (2^-3)
pub const X10: I256 = I256 {
    value: U256([0xad78ebc5ac620000u64, 0, 0, 0]),
};
// X11 = 6.25e18 = 6_250_000_000_000_000_000 (2^-4)
pub const X11: I256 = I256 {
    value: U256([0x56bc75e2d6310000u64, 0, 0, 0]),
};

// A constants - these exceed i128 range, so we need to construct them differently
// A0 = 38877084059945950922200000000000000000000000000000000000
// e^(x0) (no decimals)
pub const A0: I256 = I256 {
    value: U256([0x0262827000000000, 0xf53a27172fa9ec63, 0x0195e54c5dd42177, 0])
};

pub const A1: I256 = I256 {
    value: U256([0xf597cd205cef7380, 0x1425982c, 0, 0]),
}; // e^(x1) (no decimals)
pub const A2: I256 = I256 {
    value: U256([0xf805980ff0084000, 0x1855144814a7f, 0, 0]),
}; // e^(x2)
pub const A3: I256 = I256 {
    value: U256([0xa80a22c61ab5a700, 0x2df0ab5, 0, 0]),
}; // e^(x3)
pub const A4: I256 = I256 {
    value: U256([0xce3da636ea5cf850, 0x3f1f, 0, 0]),
}; // e^(x4)
pub const A5: I256 = I256 {
    value: U256([0xfa27722cc06cc5e2, 0x127, 0, 0]),
}; // e^(x5)
pub const A6: I256 = I256 {
    value: U256([0x0e60114edb805d03, 0x28, 0, 0]),
}; // e^(x6)
pub const A7: I256 = I256 {
    value: U256([0xbc5fb41746121110, 0xe, 0, 0]),
}; // e^(x7)
pub const A8: I256 = I256 {
    value: U256([0xf00f760a4b2db55d, 0x8, 0, 0]),
}; // e^(x8)
pub const A9: I256 = I256 {
    value: U256([0xf5f1775788937937, 0x6, 0, 0]),
}; // e^(x9)
pub const A10: I256 = I256 {
    value: U256([0x248f33704b286603, 0x6, 0, 0]),
}; // e^(x10)
pub const A11: I256 = I256 {
    value: U256([0xc548670b9510e7ac, 0x5, 0, 0]),
}; // e^(x11)

impl LogExpMath {

    /**
     * @dev Exponentiation (x^y) with unsigned 18 decimal fixed point base and exponent.
     *
     * Reverts if ln(x) * y is smaller than `MIN_NATURAL_EXPONENT`, or larger than `MAX_NATURAL_EXPONENT`.
     */
    pub fn pow(x: U256, y: U256) -> Result<U256> {
        if y.is_zero() {
            // We solve the 0^0 indetermination by making it equal one.
            return Ok(ONE_18.to_u256()?);
        }

        if x.is_zero() {
            return Ok(U256::zero());
        }

        // Instead of computing x^y directly, we instead rely on the properties of logarithms and exponentiation to
        // arrive at that result. In particular, exp(ln(x)) = x, and ln(x^y) = y * ln(x). This means
        // x^y = exp(y * ln(x)).

        // The ln function takes a signed value, so we need to make sure x fits in the signed 256 bit range.
        // Convert U256 to I256
        let x_int256 = I256::try_from(x)?;

        // We will compute y * ln(x) in a single step. Depending on the value of x, we can either use ln or ln_36. In
        // both cases, we leave the division by ONE_18 (due to fixed point multiplication) to the end.

        // This prevents y * ln(x) from overflowing, and at the same time guarantees y fits in the signed 256 bit range.
        // MILD_EXPONENT_BOUND = 2^254 / ONE_20
        let one_20_u256 = ONE_20.to_u256()?;
        let mild_exponent_bound = U256::from(2u64).pow(U256::from(254u64)) / one_20_u256;
        require!(y < mild_exponent_bound, ErrorCode::MathOverflow);
        let y_int256 = I256::try_from(y)?;

        let logx_times_y;
        if LN_36_LOWER_BOUND < x_int256 && x_int256 < LN_36_UPPER_BOUND {
            let ln_36_x = Self::ln_36(x_int256)?;

            // ln_36_x has 36 decimal places, so multiplying by y_int256 isn't as straightforward, since we can't just
            // bring y_int256 to 36 decimal places, as it might overflow. Instead, we perform two 18 decimal
            // multiplications and add the results: one with the first 18 decimals of ln_36_x, and one with the
            // (downscaled) last 18 decimals.
            let ln_36_x_high = ln_36_x / ONE_18;
            let ln_36_x_low = ln_36_x % ONE_18;
            logx_times_y = (ln_36_x_high * y_int256) + ((ln_36_x_low * y_int256) / ONE_18);
        } else {
            logx_times_y = Self::ln_internal(x_int256)? * y_int256;
        }
        let logx_times_y = logx_times_y / ONE_18;

        // Finally, we compute exp(y * ln(x)) to arrive at x^y
        require!(
            MIN_NATURAL_EXPONENT <= logx_times_y && logx_times_y <= MAX_NATURAL_EXPONENT,
            ErrorCode::MathOverflow
        );

        let exp_result = Self::exp(logx_times_y)?;
        Ok(exp_result.to_u256()?)
    }

    /**
     * @dev Natural exponentiation (e^x) with signed 18 decimal fixed point exponent.
     *
     * Reverts if `x` is smaller than MIN_NATURAL_EXPONENT, or larger than `MAX_NATURAL_EXPONENT`.
     */
    pub fn exp(x: I256) -> Result<I256> {
        require!(x >= MIN_NATURAL_EXPONENT && x <= MAX_NATURAL_EXPONENT, ErrorCode::MathOverflow);

        const ZERO: I256 = I256 { value: U256([0, 0, 0, 0]) };
        const ONE: I256 = I256 { value: U256([1, 0, 0, 0]) };
        const HUNDRED: I256 = I256 { value: U256([100, 0, 0, 0]) };
        
        if x < ZERO {
            // We only handle positive exponents: e^(-x) is computed as 1 / e^x. We can safely make x positive since it
            // fits in the signed 256 bit range (as it is larger than MIN_NATURAL_EXPONENT).
            // Fixed point division requires multiplying by ONE_18.
            let exp_neg_x = Self::exp(-x)?;
            let one_18_squared = ONE_18 * ONE_18;
            Ok(one_18_squared / exp_neg_x)
        } else {
        // First, we use the fact that e^(x+y) = e^x * e^y to decompose x into a sum of powers of two, which we call x_n,
        // where x_n == 2^(7 - n), and e^x_n = a_n has been precomputed. We choose the first x_n, x0, to equal 2^7
        // because all larger powers are larger than MAX_NATURAL_EXPONENT, and therefore not present in the
        // decomposition.
        // At the end of this process we will have the product of all e^x_n = a_n that apply, and the remainder of this
        // decomposition, which will be lower than the smallest x_n.
        // exp(x) = k_0 * a_0 * k_1 * a_1 * ... + k_n * a_n * exp(remainder), where each k_n equals either 0 or 1.
        // We mutate x by subtracting x_n, making it the remainder of the decomposition.

        // The first two a_n (e^(2^7) and e^(2^6)) are too large if stored as 18 decimal numbers, and could cause
        // intermediate overflows. Instead we store them as plain integers, with 0 decimals.
        // Additionally, x0 + x1 is larger than MAX_NATURAL_EXPONENT, which means they will not both be present in the
        // decomposition.

        // For each x_n, we test if that term is present in the decomposition (if x is larger than it), and if so deduct
        // it and compute the accumulated product.

            let mut x = x;
            let first_an;
            if x >= X0 {
                x = x - X0;
                first_an = A0;
            } else if x >= X1 {
                x = x - X1;
                first_an = A1;
        } else {
                first_an = ONE; // One with no decimal places
        }

        // We now transform x into a 20 decimal fixed point number, to have enhanced precision when computing the
        // smaller terms.
            x = x * HUNDRED;

        // `product` is the accumulated product of all a_n (except a0 and a1), which starts at 20 decimal fixed point
        // one. Recall that fixed point multiplication requires dividing by ONE_20.
            let mut product = ONE_20;

            if x >= X2 {
                x = x - X2;
                product = (product * A2) / ONE_20;
            }
            if x >= X3 {
                x = x - X3;
                product = (product * A3) / ONE_20;
            }
            if x >= X4 {
                x = x - X4;
                product = (product * A4) / ONE_20;
            }
            if x >= X5 {
                x = x - X5;
                product = (product * A5) / ONE_20;
            }
            if x >= X6 {
                x = x - X6;
                product = (product * A6) / ONE_20;
            }
            if x >= X7 {
                x = x - X7;
                product = (product * A7) / ONE_20;
            }
            if x >= X8 {
                x = x - X8;
                product = (product * A8) / ONE_20;
            }
            if x >= X9 {
                x = x - X9;
                product = (product * A9) / ONE_20;
        }

        // x10 and x11 are unnecessary here since we have high enough precision already.

        // Now we need to compute e^x, where x is small (in particular, it is smaller than x9). We use the Taylor series
        // expansion for e^x: 1 + x + (x^2 / 2!) + (x^3 / 3!) + ... + (x^n / n!).

            let mut series_sum = ONE_20; // The initial one in the sum, with 20 decimal places.
            let mut term; // Each term in the sum, where the nth term is (x^n / n!).

        // The first term is simply x.
        term = x;
            series_sum = series_sum + term;

        // Each term (x^n / n!) equals the previous one times x, divided by n. Since x is a fixed point number,
        // multiplying by it requires dividing by ONE_20, but dividing by the non-fixed point n values does not.

            const TWO: I256 = I256 { value: U256([2, 0, 0, 0]) };
            const THREE: I256 = I256 { value: U256([3, 0, 0, 0]) };
            const FOUR: I256 = I256 { value: U256([4, 0, 0, 0]) };
            const FIVE: I256 = I256 { value: U256([5, 0, 0, 0]) };
            const SIX: I256 = I256 { value: U256([6, 0, 0, 0]) };
            const SEVEN: I256 = I256 { value: U256([7, 0, 0, 0]) };
            const EIGHT: I256 = I256 { value: U256([8, 0, 0, 0]) };
            const NINE: I256 = I256 { value: U256([9, 0, 0, 0]) };
            const TEN: I256 = I256 { value: U256([10, 0, 0, 0]) };
            const ELEVEN: I256 = I256 { value: U256([11, 0, 0, 0]) };
            const TWELVE: I256 = I256 { value: U256([12, 0, 0, 0]) };

            term = ((term * x) / ONE_20) / TWO;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / THREE;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / FOUR;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / FIVE;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / SIX;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / SEVEN;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / EIGHT;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / NINE;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / TEN;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / ELEVEN;
            series_sum = series_sum + term;

            term = ((term * x) / ONE_20) / TWELVE;
            series_sum = series_sum + term;

        // 12 Taylor terms are sufficient for 18 decimal precision.

        // We now have the first a_n (with no decimals), and the product of all other a_n present, and the Taylor
        // approximation of the exponentiation of the remainder (both with 20 decimals). All that remains is to multiply
        // all three (one 20 decimal fixed point multiplication, dividing by ONE_20, and one integer multiplication),
        // and then drop two digits to return an 18 decimal value.

            Ok((((product * series_sum) / ONE_20) * first_an) / HUNDRED)
        }
    }

    /**
     * @dev Logarithm (log(arg, base), with signed 18 decimal fixed point base and argument.
     */
    pub fn log(arg: I256, base: I256) -> Result<I256> {
        // This performs a simple base change: log(arg, base) = ln(arg) / ln(base).

        // Both logBase and logArg are computed as 36 decimal fixed point numbers, either by using ln_36, or by
        // upscaling.

        let log_base;
        if LN_36_LOWER_BOUND < base && base < LN_36_UPPER_BOUND {
            log_base = Self::ln_36(base)?;
        } else {
            log_base = Self::ln_internal(base)? * ONE_18;
        }

        let log_arg;
        if LN_36_LOWER_BOUND < arg && arg < LN_36_UPPER_BOUND {
            log_arg = Self::ln_36(arg)?;
        } else {
            log_arg = Self::ln_internal(arg)? * ONE_18;
        }

        // When dividing, we multiply by ONE_18 to arrive at a result with 18 decimal places
        Ok((log_arg * ONE_18) / log_base)
    }

    /**
     * @dev Natural logarithm (ln(a)) with signed 18 decimal fixed point argument.
     */
    pub fn ln(a: I256) -> Result<I256> {
        // The real natural logarithm is not defined for negative numbers or zero.
        const ZERO: I256 = I256 { value: U256([0, 0, 0, 0]) };
        require!(a > ZERO, ErrorCode::MathOverflow);
        if LN_36_LOWER_BOUND < a && a < LN_36_UPPER_BOUND {
            Ok(Self::ln_36(a)? / ONE_18)
        } else {
            Self::ln_internal(a)
        }
    }

    /**
     * @dev Internal natural logarithm (ln(a)) with signed 18 decimal fixed point argument.
     */
    fn ln_internal(mut a: I256) -> Result<I256> {
        const ZERO: I256 = I256 { value: U256([0, 0, 0, 0]) };
        const HUNDRED: I256 = I256 { value: U256([100, 0, 0, 0]) };
        const TWO: I256 = I256 { value: U256([2, 0, 0, 0]) };
        const THREE: I256 = I256 { value: U256([3, 0, 0, 0]) };
        const FIVE: I256 = I256 { value: U256([5, 0, 0, 0]) };
        const SEVEN: I256 = I256 { value: U256([7, 0, 0, 0]) };
        const NINE: I256 = I256 { value: U256([9, 0, 0, 0]) };
        const ELEVEN: I256 = I256 { value: U256([11, 0, 0, 0]) };
        
        if a < ONE_18 {
            // Since ln(a^k) = k * ln(a), we can compute ln(a) as ln(a) = ln((1/a)^(-1)) = - ln((1/a)). If a is less
            // than one, 1/a will be greater than one, and this if statement will not be entered in the recursive call.
            // Fixed point division requires multiplying by ONE_18.
            let one_18_squared = ONE_18 * ONE_18;
            Ok(-Self::ln_internal(one_18_squared / a)?)
        } else {
        // First, we use the fact that ln^(a * b) = ln(a) + ln(b) to decompose ln(a) into a sum of powers of two, which
        // we call x_n, where x_n == 2^(7 - n), which are the natural logarithm of precomputed quantities a_n (that is,
        // ln(a_n) = x_n). We choose the first x_n, x0, to equal 2^7 because the exponential of all larger powers cannot
        // be represented as 18 fixed point decimal numbers in 256 bits, and are therefore larger than a.
        // At the end of this process we will have the sum of all x_n = ln(a_n) that apply, and the remainder of this
        // decomposition, which will be lower than the smallest a_n.
        // ln(a) = k_0 * x_0 + k_1 * x_1 + ... + k_n * x_n + ln(remainder), where each k_n equals either 0 or 1.
        // We mutate a by subtracting a_n, making it the remainder of the decomposition.

        // For reasons related to how `exp` works, the first two a_n (e^(2^7) and e^(2^6)) are not stored as fixed point
        // numbers with 18 decimals, but instead as plain integers with 0 decimals, so we need to multiply them by
        // ONE_18 to convert them to fixed point.
        // For each a_n, we test if that term is present in the decomposition (if a is larger than it), and if so divide
        // by it and compute the accumulated sum.

            let mut sum = ZERO;
            
            // A0 and A1 are stored as integers (no decimals), so we multiply by ONE_18 to convert to fixed point
            // In Solidity: if (a >= a0 * ONE_18)
            // We can safely compare directly because if a0 * ONE_18 overflows, the comparison will fail anyway
            if a >= A0 * ONE_18 {
                a = a / A0; // Integer, not fixed point division
                sum = sum + X0;
            }

            if a >= A1 * ONE_18 {
                a = a / A1; // Integer, not fixed point division
                sum = sum + X1;
        }

        // All other a_n and x_n are stored as 20 digit fixed point numbers, so we convert the sum and a to this format.
            sum = sum * HUNDRED;
            a = a * HUNDRED;

        // Because further a_n are  20 digit fixed point numbers, we multiply by ONE_20 when dividing by them.

            if a >= A2 {
                a = (a * ONE_20) / A2;
                sum = sum + X2;
            }

            if a >= A3 {
                a = (a * ONE_20) / A3;
                sum = sum + X3;
            }

            if a >= A4 {
                a = (a * ONE_20) / A4;
                sum = sum + X4;
            }

            if a >= A5 {
                a = (a * ONE_20) / A5;
                sum = sum + X5;
            }

            if a >= A6 {
                a = (a * ONE_20) / A6;
                sum = sum + X6;
            }

            if a >= A7 {
                a = (a * ONE_20) / A7;
                sum = sum + X7;
            }

            if a >= A8 {
                a = (a * ONE_20) / A8;
                sum = sum + X8;
            }

            if a >= A9 {
                a = (a * ONE_20) / A9;
                sum = sum + X9;
            }

            if a >= A10 {
                a = (a * ONE_20) / A10;
                sum = sum + X10;
            }

            if a >= A11 {
                a = (a * ONE_20) / A11;
                sum = sum + X11;
        }

        // a is now a small number (smaller than a_11, which roughly equals 1.06). This means we can use a Taylor series
        // that converges rapidly for values of `a` close to one - the same one used in ln_36.
        // Let z = (a - 1) / (a + 1).
        // ln(a) = 2 * (z + z^3 / 3 + z^5 / 5 + z^7 / 7 + ... + z^(2 * n + 1) / (2 * n + 1))

        // Recall that 20 digit fixed point division requires multiplying by ONE_20, and multiplication requires
        // division by ONE_20.
            let z = ((a - ONE_20) * ONE_20) / (a + ONE_20);
            let z_squared = (z * z) / ONE_20;

        // num is the numerator of the series: the z^(2 * n + 1) term
            let mut num = z;

        // seriesSum holds the accumulated sum of each term in the series, starting with the initial z
            let mut series_sum = num;

        // In each step, the numerator is multiplied by z^2
        num = (num * z_squared) / ONE_20;
            series_sum = series_sum + (num / THREE);

        num = (num * z_squared) / ONE_20;
            series_sum = series_sum + (num / FIVE);

        num = (num * z_squared) / ONE_20;
            series_sum = series_sum + (num / SEVEN);

        num = (num * z_squared) / ONE_20;
            series_sum = series_sum + (num / NINE);

        num = (num * z_squared) / ONE_20;
            series_sum = series_sum + (num / ELEVEN);

        // 6 Taylor terms are sufficient for 36 decimal precision.

        // Finally, we multiply by 2 (non fixed point) to compute ln(remainder)
            series_sum = series_sum * TWO;

        // We now have the sum of all x_n present, and the Taylor approximation of the logarithm of the remainder (both
        // with 20 decimals). All that remains is to sum these two, and then drop two digits to return a 18 decimal
        // value.

            Ok((sum + series_sum) / HUNDRED)
        }
    }

    /**
     * @dev Internal high precision (36 decimal places) natural logarithm (ln(x)) with signed 18 decimal fixed point argument,
     * for x close to one.
     *
     * Should only be used if x is between LN_36_LOWER_BOUND and LN_36_UPPER_BOUND.
     */
    fn ln_36(mut x: I256) -> Result<I256> {
        // Since ln(1) = 0, a value of x close to one will yield a very small result, which makes using 36 digits
        // worthwhile.

        // First, we transform x to a 36 digit fixed point value.
        x = x * ONE_18;

        // We will use the following Taylor expansion, which converges very rapidly. Let z = (x - 1) / (x + 1).
        // ln(x) = 2 * (z + z^3 / 3 + z^5 / 5 + z^7 / 7 + ... + z^(2 * n + 1) / (2 * n + 1))

        // Recall that 36 digit fixed point division requires multiplying by ONE_36, and multiplication requires
        // division by ONE_36.
        const THREE: I256 = I256 { value: U256([3, 0, 0, 0]) };
        const FIVE: I256 = I256 { value: U256([5, 0, 0, 0]) };
        const SEVEN: I256 = I256 { value: U256([7, 0, 0, 0]) };
        const NINE: I256 = I256 { value: U256([9, 0, 0, 0]) };
        const ELEVEN: I256 = I256 { value: U256([11, 0, 0, 0]) };
        const THIRTEEN: I256 = I256 { value: U256([13, 0, 0, 0]) };
        const FIFTEEN: I256 = I256 { value: U256([15, 0, 0, 0]) };
        const TWO: I256 = I256 { value: U256([2, 0, 0, 0]) };
        
        let z = ((x - ONE_36) * ONE_36) / (x + ONE_36);
        let z_squared = (z * z) / ONE_36;

        // num is the numerator of the series: the z^(2 * n + 1) term
        let mut num = z;

        // seriesSum holds the accumulated sum of each term in the series, starting with the initial z
        let mut series_sum = num;

        // In each step, the numerator is multiplied by z^2
        num = (num * z_squared) / ONE_36;
        series_sum = series_sum + (num / THREE);

        num = (num * z_squared) / ONE_36;
        series_sum = series_sum + (num / FIVE);

        num = (num * z_squared) / ONE_36;
        series_sum = series_sum + (num / SEVEN);

        num = (num * z_squared) / ONE_36;
        series_sum = series_sum + (num / NINE);

        num = (num * z_squared) / ONE_36;
        series_sum = series_sum + (num / ELEVEN);

        num = (num * z_squared) / ONE_36;
        series_sum = series_sum + (num / THIRTEEN);

        num = (num * z_squared) / ONE_36;
        series_sum = series_sum + (num / FIFTEEN);

        // 8 Taylor terms are sufficient for 36 decimal precision.

        // All that remains is multiplying by 2 (non fixed point).
        Ok(series_sum * TWO)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use primitive_types::U256;

    #[test]
    fn test_ln_basic() {
        // Test ln(1e18) should be close to 0
        let one = I256::try_from(U256::from(1_000_000_000_000_000_000u64)).unwrap();
        let result = LogExpMath::ln(one).unwrap();
        // ln(1) = 0, so result should be very close to 0
        assert!(result.value < U256::from(1_000_000_000_000_000u64)); // Less than 0.001
    }

    #[test]
    fn test_ln_100() {
        // Test ln(100e18) should be close to ln(100) * 1e18 ≈ 4.60517e18
        let hundred = I256::try_from(U256::from(100u128) * U256::from(1_000_000_000_000_000_000u64)).unwrap();
        let result = LogExpMath::ln(hundred).unwrap();
        let expected = I256::try_from(U256::from(4_605_170_000_000_000_000u64)).unwrap(); // ln(100) ≈ 4.60517
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff.value < expected.value / U256::from(100u64));
    }

    #[test]
    fn test_ln_1000() {
        // Test ln(1000e18) should be close to ln(1000) * 1e18 ≈ 6.90776e18
        let thousand = I256::try_from(U256::from(1000u128) * U256::from(1_000_000_000_000_000_000u64)).unwrap();
        let result = LogExpMath::ln(thousand).unwrap();
        let expected = I256::try_from(U256::from(6_907_760_000_000_000_000u64)).unwrap(); // ln(1000) ≈ 6.90776
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff.value < expected.value / U256::from(100u64));
    }

    #[test]
    fn test_ln_36_range() {
        // Test values in ln_36 range (0.9e18 to 1.1e18)
        let point95 = I256::try_from(U256::from(950_000_000_000_000_000u64)).unwrap();
        let result = LogExpMath::ln(point95).unwrap();
        // ln(0.95) ≈ -0.05129, so result should be negative
        assert!(result.is_negative());
    }

    #[test]
    fn test_exp_basic() {
        // Test exp(0) should be 1e18
        let zero = I256::try_from(0i128).unwrap();
        let result = LogExpMath::exp(zero).unwrap();
        assert_eq!(result, ONE_18);
    }

    #[test]
    fn test_exp_small() {
        // Test exp(1e18) should be close to e * 1e18 ≈ 2.71828e18
        let one = ONE_18;
        let result = LogExpMath::exp(one).unwrap();
        let expected = I256::try_from(U256::from(2_718_280_000_000_000_000u64)).unwrap(); // e ≈ 2.71828
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff.value < expected.value / U256::from(100u64));
    }

    #[test]
    fn test_pow_basic() {
        // Test 2^2 = 4
        let base = U256::from(2_000_000_000_000_000_000u64); // 2e18
        let exp = U256::from(2_000_000_000_000_000_000u64); // 2e18
        let result = LogExpMath::pow(base, exp).unwrap();
        let expected = U256::from(4_000_000_000_000_000_000u64); // 4e18
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff < expected / U256::from(100u64));
    }

    #[test]
    fn test_exp_negative() {
        // Test exp(-1e18) should be close to 1/e ≈ 0.367879
        let neg_one = I256::try_from(-1_000_000_000_000_000_000i128).unwrap();
        let result = LogExpMath::exp(neg_one).unwrap();
        let expected = I256::try_from(U256::from(367_879_000_000_000_000u64)).unwrap(); // 1/e ≈ 0.367879
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff.value < expected.value / U256::from(100u64));
    }

    #[test]
    fn test_exp_large() {
        // Test exp(2e18) should be close to e^2 ≈ 7.389
        // Note: MAX_NATURAL_EXPONENT = 130e18, so we can test up to 130
        // But for accuracy, we test with smaller values
        let two = I256::try_from(U256::from(2u128) * U256::from(1_000_000_000_000_000_000u64)).unwrap();
        let result = LogExpMath::exp(two).unwrap();
        let expected = I256::try_from(U256::from(7_389_000_000_000_000_000u64)).unwrap(); // e^2 ≈ 7.389
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff.value < expected.value / U256::from(100u64));
    }

    #[test]
    fn test_exp_near_max() {
        // Test exp near MAX_NATURAL_EXPONENT (130e18)
        // Use a value close to but less than the maximum
        let near_max = MAX_NATURAL_EXPONENT - ONE_18; // 129e18
        let result = LogExpMath::exp(near_max);
        // Should succeed (not panic)
        assert!(result.is_ok());
    }

    #[test]
    fn test_exp_near_min() {
        // Test exp near MIN_NATURAL_EXPONENT (-41e18)
        // Use a value close to but greater than the minimum
        let near_min = MIN_NATURAL_EXPONENT + ONE_18; // -40e18
        let result = LogExpMath::exp(near_min);
        // Should succeed (not panic)
        assert!(result.is_ok());
    }

    #[test]
    fn test_ln_small() {
        // Test ln(0.5e18) should be close to ln(0.5) * 1e18 ≈ -0.693147e18
        let half = I256::try_from(U256::from(500_000_000_000_000_000u64)).unwrap();
        let result = LogExpMath::ln(half).unwrap();
        // ln(0.5) ≈ -0.693147, so result should be negative
        assert!(result.is_negative());
        let expected_abs = U256::from(693_147_000_000_000_000u64);
        let result_abs = result.abs().unwrap();
        let diff = if result_abs > expected_abs { result_abs - expected_abs } else { expected_abs - result_abs };
        // Allow 1% error
        assert!(diff < expected_abs / U256::from(100u64));
    }

    #[test]
    fn test_ln_e() {
        // Test ln(e * 1e18) should be close to 1e18
        let e = I256::try_from(U256::from(2_718_281_828_459_045_235u64)).unwrap(); // e ≈ 2.71828...
        let result = LogExpMath::ln(e).unwrap();
        let expected = ONE_18;
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 0.1% error
        assert!(diff.value < expected.value / U256::from(1000u64));
    }

    #[test]
    fn test_log_basic() {
        // Test log(100, 10) should be close to 2e18
        let arg = I256::try_from(U256::from(100u128) * U256::from(1_000_000_000_000_000_000u64)).unwrap();
        let base = I256::try_from(U256::from(10u128) * U256::from(1_000_000_000_000_000_000u64)).unwrap();
        let result = LogExpMath::log(arg, base).unwrap();
        let expected = I256::try_from(U256::from(2_000_000_000_000_000_000u64)).unwrap(); // log10(100) = 2
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff.value < expected.value / U256::from(100u64));
    }

    #[test]
    fn test_pow_fractional() {
        // Test 4^0.5 = 2 (square root)
        let base = U256::from(4_000_000_000_000_000_000u64); // 4e18
        let exp = U256::from(500_000_000_000_000_000u64); // 0.5e18
        let result = LogExpMath::pow(base, exp).unwrap();
        let expected = U256::from(2_000_000_000_000_000_000u64); // 2e18
        let diff = if result > expected { result - expected } else { expected - result };
        // Allow 1% error
        assert!(diff < expected / U256::from(100u64));
    }

    #[test]
    #[should_panic]
    fn test_ln_zero() {
        // Test ln(0) should panic
        let zero = I256::try_from(0i128).unwrap();
        let _ = LogExpMath::ln(zero).unwrap();
    }

    #[test]
    #[should_panic]
    fn test_ln_negative() {
        // Test ln(negative) should panic
        let neg = I256::try_from(-1_000_000_000_000_000_000i128).unwrap();
        let _ = LogExpMath::ln(neg).unwrap();
    }

    #[test]
    #[should_panic]
    fn test_exp_too_large() {
        // Test exp(>MAX_NATURAL_EXPONENT) should panic
        let too_large = MAX_NATURAL_EXPONENT + ONE_18;
        let _ = LogExpMath::exp(too_large).unwrap();
    }

    #[test]
    #[should_panic]
    fn test_exp_too_small() {
        // Test exp(<MIN_NATURAL_EXPONENT) should panic
        let too_small = MIN_NATURAL_EXPONENT - ONE_18;
        let _ = LogExpMath::exp(too_small).unwrap();
    }
}
