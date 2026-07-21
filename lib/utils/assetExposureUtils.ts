import { Asset, AssetComposition } from '@/types/assets';
import { calculateAssetValue } from '../services/assetService';

export interface ExposureComponent {
    assetClass: string;
    subCategory?: string;
    marketValue: number; // Market value of an asset
    notionalValue: number; // Notional value: marketValue * leverageRatio
}

export function expandAssetExposure(asset: Asset): ExposureComponent[] {
    const marketValue = calculateAssetValue(asset);
    const leverage = asset.leverageRatio ?? 1;

    // A fondo pensione is kept WHOLE as its own 'pension' class in every aggregate view (target
    // allocation, net worth, storico) REGARDLESS of any underlying composition. Its composition is
    // looked through ONLY in the dedicated Previdenza views (spec §2.1/§8.1): expanding it here would
    // dilute the actionable allocation targets and dissolve the distinct previdenza net-worth segment.
    if (asset.type === 'pension') {
        return [{
            assetClass: asset.assetClass,
            subCategory: asset.subCategory,
            marketValue,
            notionalValue: marketValue,
        }];
    }

    // Single-class leveraged ETF (e.g. a plain 2x S&P500): no composition legs, the
    // whole market value sits in the asset's own class, but leverage still multiplies
    // its notional exposure. Composite legs (below) apply leverage per-leg instead.
    if (!asset.composition || asset.composition.length === 0) {
        return [{
            assetClass: asset.assetClass,
            subCategory: asset.subCategory,
            marketValue,
            notionalValue: marketValue * leverage,
        }];
    }

    return asset.composition.map((comp) => ({
        assetClass: comp.assetClass,
        subCategory: comp.subCategory,
        marketValue: marketValue * comp.percentage / 100,
        notionalValue: marketValue * comp.percentage / 100 * leverage,
    }));
}

export function calculatePortfolioLeverage(assets: Asset[]): number {
    let totalMarketValue = 0;
    let totalNotionalValue = 0;

    assets.forEach(asset => {
        const components = expandAssetExposure(asset);
        components.forEach(comp => {
            totalMarketValue += comp.marketValue;
            totalNotionalValue += comp.notionalValue ?? comp.marketValue; // If notionalValue is undefined, use marketValue
        });
    });

    return totalMarketValue > 0 ? totalNotionalValue / totalMarketValue : 1;
}