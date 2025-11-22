#!/usr/bin/env python3
"""
计算多 token 池的流动性操作（CPMM模型）

CPMM流动性操作原理：
- 添加流动性：用户按当前池子的比例提供所有token，铸造LP按比例计算
- 移除流动性：用户销毁LP，按比例获得所有token

不需要计算池子总价值，只需要简单的比例计算！

支持：
- 费率（万分之三）
"""

import math
from typing import List, Tuple, Dict

def calculate_add_liquidity(
    vaults: List[float],
    amounts_in: List[float],
    total_lp_supply: float,
    fee_rate: float = 0.0003
) -> Tuple[float, List[float], Dict]:
    """
    计算添加流动性操作（CPMM模型）
    
    用户按当前池子的比例提供所有token，铸造LP按比例计算
    
    公式：
    - 首次添加：LP = 第一个token的数量（作为基准）
    - 后续添加：LP = total_LP * (提供的token数量 / 该token当前储备)
    - 用户必须按比例提供所有token，否则会有损失
    
    Args:
        vaults: 当前储备列表
        amounts_in: 用户提供的token数量列表
        total_lp_supply: 当前LP token总供应量
        fee_rate: 添加流动性费率（默认万分之三）
    
    Returns:
        (lp_minted, amounts_in_after_fee, info)
        - lp_minted: 铸造的LP token数量
        - amounts_in_after_fee: 扣除费率后实际添加的token数量
        - info: 详细信息字典
    """
    n = len(vaults)
    assert len(amounts_in) == n, "输入数量必须与token数量一致"
    
    # 扣除费率
    burn_fees = [amount * fee_rate for amount in amounts_in]
    amounts_in_after_fee = [amount - fee for amount, fee in zip(amounts_in, burn_fees)]
    
    # 计算LP铸造数量
    if total_lp_supply == 0:
        # 首次添加流动性：使用第一个token作为基准
        # LP = 第一个token的数量（扣费后）
        lp_minted = amounts_in_after_fee[0]
    else:
        # 后续添加：按比例计算
        # LP = total_LP * (amount / vault)
        # 使用第一个token作为基准计算比例
        ratio = amounts_in_after_fee[0] / vaults[0]
        lp_minted = total_lp_supply * ratio
        
        # 验证所有token的比例是否一致（允许一定误差）
        for i in range(1, n):
            if vaults[i] > 0:
                ratio_i = amounts_in_after_fee[i] / vaults[i]
                if abs(ratio_i - ratio) / ratio > 0.01:  # 超过1%误差
                    print(f"警告: token_{i} 的比例 {ratio_i:.6f} 与基准比例 {ratio:.6f} 不一致")
    
    # 计算添加后的储备
    vaults_after = [vault + amount for vault, amount in zip(vaults, amounts_in_after_fee)]
    
    info = {
        'burn_fees': burn_fees,
        'vaults_after': vaults_after,
        'ratio': amounts_in_after_fee[0] / vaults[0] if total_lp_supply > 0 and vaults[0] > 0 else 0,
    }
    
    return lp_minted, amounts_in_after_fee, info

def calculate_remove_liquidity(
    vaults: List[float],
    lp_to_burn: float,
    total_lp_supply: float,
    fee_rate: float = 0.0003
) -> Tuple[List[float], List[float], Dict]:
    """
    计算移除流动性操作（CPMM模型）
    
    用户销毁LP token，按比例获得所有token
    
    公式：
    - LP占比 = lp_to_burn / total_LP
    - 每个token的输出 = vault_i * LP占比
    
    Args:
        vaults: 当前储备列表
        lp_to_burn: 要销毁的LP token数量
        total_lp_supply: 当前LP token总供应量
        fee_rate: 移除流动性费率（默认万分之三）
    
    Returns:
        (amounts_out, amounts_out_after_fee, info)
        - amounts_out: 用户获得的token数量（税前）
        - amounts_out_after_fee: 用户获得的token数量（税后）
        - info: 详细信息字典
    """
    n = len(vaults)
    assert lp_to_burn <= total_lp_supply, "销毁的LP数量不能超过总供应量"
    
    # 计算LP占比
    lp_ratio = lp_to_burn / total_lp_supply
    
    # 按比例计算用户应得的token数量（税前）
    amounts_out = [vault * lp_ratio for vault in vaults]
    
    # 扣除费率
    burn_fees = [amount * fee_rate for amount in amounts_out]
    amounts_out_after_fee = [amount - fee for amount, fee in zip(amounts_out, burn_fees)]
    
    # 计算移除后的储备
    vaults_after = [vault - amount for vault, amount in zip(vaults, amounts_out)]
    
    info = {
        'lp_ratio': lp_ratio,
        'burn_fees': burn_fees,
        'vaults_after': vaults_after,
    }
    
    return amounts_out, amounts_out_after_fee, info

def test_liquidity_operations():
    """测试流动性添加和移除操作（CPMM模型）"""
    print("\n" + "="*80)
    print("测试流动性操作（CPMM模型 - 按比例添加/移除）")
    print("="*80)
    
    # 初始设置：6个token
    vaults = [10e6, 50e6, 100e6, 20e6, 30e6, 40e6]  # 初始储备
    weights_base = [20, 40, 80, 30, 50, 60]  # 权重（仅用于Rust测试数据）
    
    fee_rate = 0.0003  # 万分之三
    total_lp_supply = 0  # 初始LP供应量为0
    
    print("\n初始状态:")
    print(f"  储备: {[f'{v:,.0f}' for v in vaults]}")
    print(f"  LP总供应: {total_lp_supply:,.2f}")
    
    # 测试1: 第一次添加流动性（bootstrap）
    print("\n" + "-"*80)
    print("测试1: 第一次添加流动性（bootstrap）")
    print("-"*80)
    
    amounts_in_1 = [1e6, 5e6, 10e6, 2e6, 3e6, 4e6]  # 用户提供的token（按比例）
    lp_minted_1, amounts_after_fee_1, info_1 = calculate_add_liquidity(
        vaults, amounts_in_1, total_lp_supply, fee_rate
    )
    
    print(f"\n用户提供:")
    for i, (amount, fee) in enumerate(zip(amounts_in_1, info_1['burn_fees'])):
        print(f"  token_{i}: {amount:,.0f} (fee: {fee:,.2f}, 实际: {amounts_after_fee_1[i]:,.2f})")
    
    print(f"\n铸造LP token: {lp_minted_1:,.2f}")
    print(f"说明: 首次添加，LP = 第一个token的数量（扣费后）= {amounts_after_fee_1[0]:,.2f}")
    
    # 更新状态
    vaults = info_1['vaults_after']
    total_lp_supply = lp_minted_1
    
    print(f"\n更新后状态:")
    print(f"  储备: {[f'{v:,.2f}' for v in vaults]}")
    print(f"  LP总供应: {total_lp_supply:,.2f}")
    
    # 测试2: 第二次添加流动性
    print("\n" + "-"*80)
    print("测试2: 第二次添加流动性")
    print("-"*80)
    
    amounts_in_2 = [0.5e6, 2.5e6, 5e6, 1e6, 1.5e6, 2e6]  # 用户提供的token
    lp_minted_2, amounts_after_fee_2, info_2 = calculate_add_liquidity(
        vaults, amounts_in_2, total_lp_supply, fee_rate
    )
    
    print(f"\n用户提供:")
    for i, (amount, fee) in enumerate(zip(amounts_in_2, info_2['burn_fees'])):
        print(f"  token_{i}: {amount:,.0f} (fee: {fee:,.2f}, 实际: {amounts_after_fee_2[i]:,.2f})")
    
    print(f"\n铸造LP token: {lp_minted_2:,.2f}")
    print(f"添加比例: {info_2['ratio']*100:.4f}%")
    print(f"说明: LP = total_LP * ratio = {total_lp_supply:,.2f} * {info_2['ratio']:.6f} = {lp_minted_2:,.2f}")
    
    # 更新状态
    vaults = info_2['vaults_after']
    total_lp_supply += lp_minted_2
    
    print(f"\n更新后状态:")
    print(f"  储备: {[f'{v:,.2f}' for v in vaults]}")
    print(f"  LP总供应: {total_lp_supply:,.2f}")
    
    # 测试3: 移除流动性
    print("\n" + "-"*80)
    print("测试3: 移除流动性")
    print("-"*80)
    
    lp_to_burn = lp_minted_1 * 0.5  # 销毁第一次铸造LP的50%
    amounts_out, amounts_out_after_fee, info_3 = calculate_remove_liquidity(
        vaults, lp_to_burn, total_lp_supply, fee_rate
    )
    
    print(f"\n销毁LP token: {lp_to_burn:,.2f} ({info_3['lp_ratio']*100:.2f}% of total)")
    print(f"\n用户获得:")
    for i, (amount, amount_after_fee, fee) in enumerate(zip(amounts_out, amounts_out_after_fee, info_3['burn_fees'])):
        print(f"  token_{i}: {amount:,.2f} (fee: {fee:,.2f}, 实际: {amount_after_fee:,.2f})")
    
    print(f"说明: 每个token输出 = vault * ratio = vault * {info_3['lp_ratio']:.6f}")
    
    # 更新状态
    vaults = info_3['vaults_after']
    total_lp_supply -= lp_to_burn
    
    print(f"\n更新后状态:")
    print(f"  储备: {[f'{v:,.2f}' for v in vaults]}")
    print(f"  LP总供应: {total_lp_supply:,.2f}")
    
    print("\n✅ 流动性操作测试完成！")
    
    # 打印Rust测试数据
    print("\n" + "="*80)
    print("Rust测试数据（流动性操作）:")
    print("="*80)
    
    # 重置为初始状态进行最终计算
    vaults_init = [10e6, 50e6, 100e6, 20e6, 30e6, 40e6]
    weights_base = [20, 40, 80, 30, 50, 60]
    weights_for_rust = [w * 1e9 for w in weights_base]  # Rust使用9位小数
    
    # 重新计算所有值以获取准确的整数
    lp_1, amounts_after_fee_1, info_1 = calculate_add_liquidity(
        vaults_init, amounts_in_1, 0, fee_rate
    )
    
    lp_2, amounts_after_fee_2, info_2 = calculate_add_liquidity(
        info_1['vaults_after'], amounts_in_2, lp_1, fee_rate
    )
    
    lp_burn = lp_1 * 0.5
    _, amounts_out_final, _ = calculate_remove_liquidity(
        info_2['vaults_after'], lp_burn, lp_1 + lp_2, fee_rate
    )
    
    print(f"\n// 初始储备（6个token）")
    print(f"let vaults: Vec<u64> = vec![{', '.join([f'{int(v)}u64' for v in vaults_init])}];")
    print(f"\n// 权重（9位小数精度，仅用于swap操作）")
    print(f"let weights: Vec<u64> = vec![{', '.join([f'{int(w)}u64' for w in weights_for_rust])}];")
    
    print(f"\n// 第一次添加流动性（bootstrap）")
    print(f"let amounts_in_1: Vec<u64> = vec![{', '.join([f'{int(a)}u64' for a in amounts_in_1])}];")
    print(f"let expected_lp_1: u64 = {int(lp_1)}u64;  // ≈ {lp_1:,.2f}")
    
    print(f"\n// 第二次添加流动性")
    print(f"let amounts_in_2: Vec<u64> = vec![{', '.join([f'{int(a)}u64' for a in amounts_in_2])}];")
    print(f"let expected_lp_2: u64 = {int(lp_2)}u64;  // ≈ {lp_2:,.2f}")
    
    print(f"\n// 移除流动性（销毁第一次LP的50%）")
    print(f"let lp_to_burn: u64 = {int(lp_burn)}u64;  // ≈ {lp_burn:,.2f}")
    print(f"let expected_amounts_out: Vec<u64> = vec![{', '.join([f'{int(a)}u64' for a in amounts_out_final])}];")

if __name__ == "__main__":
    test_liquidity_operations()

