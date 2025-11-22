#!/usr/bin/env python3
"""
计算测试用例中的swap预期输出
使用加权CPMM公式: sum(weight_i * ln(vault_i)) = constant
"""

import math

def calculate_swap_output(
    vaults_before,
    weights,
    amount_in,
    token_in_index,
    token_out_index,
    fee_rate
):
    """
    计算swap的输出量
    
    Args:
        vaults_before: swap前的各token储备
        weights: 各token的权重
        amount_in: 输入量
        token_in_index: 输入token索引
        token_out_index: 输出token索引
        fee_rate: 费率（例如0.0003表示0.03%）
    
    Returns:
        输出量
    """
    n = len(vaults_before)
    
    # 计算扣费后的输入
    amount_in_after_fee = amount_in * (1 - fee_rate)
    
    # 计算swap前的constant
    constant_before = sum(weights[i] * math.log(vaults_before[i]) for i in range(n))
    
    print(f"\n=== Swap计算 ===")
    print(f"输入token索引: {token_in_index}")
    print(f"输出token索引: {token_out_index}")
    print(f"输入量: {amount_in:,.0f}")
    print(f"费率: {fee_rate * 100:.4f}%")
    print(f"扣费后输入: {amount_in_after_fee:,.0f}")
    print(f"\nSwap前储备:")
    for i in range(n):
        print(f"  Token{i}: vault={vaults_before[i]:,.0f}, weight={weights[i]}")
    print(f"\nConstant before: {constant_before:.18f}")
    
    # 计算除了输出token外的所有token对constant的贡献
    constant_without_out = 0
    for i in range(n):
        if i == token_out_index:
            continue
        elif i == token_in_index:
            # 输入token的vault增加
            vault_after = vaults_before[i] + amount_in_after_fee
            constant_without_out += weights[i] * math.log(vault_after)
            print(f"\n输入Token{i} vault变化: {vaults_before[i]:,.0f} -> {vault_after:,.0f}")
        else:
            # 其他token不变
            constant_without_out += weights[i] * math.log(vaults_before[i])
    
    # 计算输出token应该的值
    # constant_before = constant_without_out + weight_out * ln(vault_out_after)
    # ln(vault_out_after) = (constant_before - constant_without_out) / weight_out
    weight_out = weights[token_out_index]
    ln_vault_out_after = (constant_before - constant_without_out) / weight_out
    vault_out_after = math.exp(ln_vault_out_after)
    
    # 输出量
    amount_out = vaults_before[token_out_index] - vault_out_after
    
    print(f"\n输出Token{token_out_index}:")
    print(f"  ln(vault_after) = {ln_vault_out_after:.18f}")
    print(f"  vault_after = {vault_out_after:,.0f}")
    print(f"  vault_before = {vaults_before[token_out_index]:,.0f}")
    print(f"  输出量 = {amount_out:,.0f}")
    
    # 验证constant
    vaults_after = vaults_before.copy()
    vaults_after[token_in_index] += amount_in_after_fee
    vaults_after[token_out_index] -= amount_out
    constant_after = sum(weights[i] * math.log(vaults_after[i]) for i in range(n))
    
    print(f"\nConstant after: {constant_after:.18f}")
    print(f"Constant差异: {abs(constant_after - constant_before):.18e}")
    
    return int(amount_out)


# 测试用例1: token1 -> token2 (权重40:40)
print("=" * 80)
print("测试用例1: Swap token1 -> token2")
print("=" * 80)

vaults = [
    10_000_000_000_000,  # token0
    20_000_000_000_000,  # token1
    20_000_000_000_000,  # token2
]
weights = [20, 40, 40]
amount_in = 10_000_000_000_000
fee_rate = 3 / 10000  # 0.03%

output1 = calculate_swap_output(
    vaults,
    weights,
    amount_in,
    token_in_index=1,  # token1输入
    token_out_index=2,  # token2输出
    fee_rate=fee_rate
)

print(f"\n✅ 预期输出: {output1:,}")

# 测试用例2: token2 -> token0 (权重40:40，但token0权重修改后)
# 注意：这个测试依赖于权重修改，修改后权重为 [40, 20, 40]
print("\n" + "=" * 80)
print("测试用例2: Swap token2 -> token0 (权重修改后)")
print("=" * 80)

# Swap1后的vault状态
vaults_after_swap1 = [
    10_000_000_000_000,  # token0不变
    20_000_000_000_000 + (10_000_000_000_000 * (1 - fee_rate)),  # token1增加
    20_000_000_000_000 - output1,  # token2减少
]

# 权重修改后
weights_modified = [40, 20, 40]

# 使用所有token2作为输入
amount_in_2 = output1

output2 = calculate_swap_output(
    vaults_after_swap1,
    weights_modified,
    amount_in_2,
    token_in_index=2,  # token2输入
    token_out_index=0,  # token0输出
    fee_rate=fee_rate
)

print(f"\n✅ 预期输出: {output2:,}")

# 生成TypeScript测试代码
print("\n" + "=" * 80)
print("TypeScript测试代码片段:")
print("=" * 80)
print(f"""
// Swap1: token1 -> token2
const swapAmount1 = {amount_in};
const expectedOut1 = {output1}; // 预期输出
const fee1 = Math.floor(swapAmount1 * 3 / 10000); // {int(amount_in * fee_rate)}

// Swap2: token2 -> token0 (使用swap1的输出)
const swapAmount2 = {output1};
const expectedOut2 = {output2}; // 预期输出
const fee2 = Math.floor(swapAmount2 * 3 / 10000); // {int(output1 * fee_rate)}
""")

