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
    
    if (!asset.composition || asset.composition.length === 0) {
        return [{
            assetClass: asset.assetClass,
            subCategory: asset.subCategory,
            marketValue,
            notionalValue: marketValue,
        }];
    }

    const leverage = asset.leverageRatio ?? 1;

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