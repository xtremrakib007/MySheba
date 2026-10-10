import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { FormLabel, Grid3, OperatorCard, FormInput, PackageCard, SummaryCard } from '../components/ui';
import { GAME_TOP_UPS, gameByKey, packById } from '../data/gameTopUps';
import * as apiProviderService from '../firebase/apiProviderService';

// Entertainment is game top-ups: PUBG UC, Free Fire diamonds, ML diamonds.
//
// It used to ask for a country, a mobile operator and a phone number, then show
// nothing at all - because it searched the Success TopUp catalogue for a
// category that catalogue has no rows in. All 450 packages Success TopUp sells
// are Data, Bundle, Voice and Call Rate; there is no game voucher among them.
// So the screen was asking for a mobile operator, which a game top-up does not
// have, in order to list products that do not exist.
//
// The flow is now the three things an order actually needs: which game, which
// pack, and who to credit. Fulfilment is manual - staff buy the code and
// deliver it - which is the same path every order the provider cannot serve
// already takes.
//
// Steps: game -> pack -> player ID.
export default function EntertainmentStep({ step }) {
  const { serviceData, updateServiceData, nextStep } = useApp();
  const [catalog, setCatalog] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');

  // Fetch the live IIMMPACT catalogue directly. The backend resolves the active
  // IIMMPACT provider for Malaysia, so this does not depend on the provider's
  // legacy services[] list containing the exact label "Entertainment".
  useEffect(() => {
    let alive = true;
    setCatalog(null);
    setCatalogError('');
    setOptions([]);
    const load = async () => {
      setCatalogLoading(true);
      try {
        const data = await apiProviderService.getIimmpactCatalogForUser('', 'Entertainment', 'MY');
        if (alive) setCatalog(data?.providerId ? data : null);
        if (alive && !data?.providerId) setCatalogError('No active IIMMPACT provider is configured for Malaysia.');
      } catch (e) {
        if (alive) setCatalogError(e?.message || 'IIMMPACT Entertainment catalog is unavailable.');
      } finally {
        if (alive) setCatalogLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  const dynamicProducts = (() => {
    const products = catalog?.products || {};
    const tree = catalog?.tree?.groups || [];
    const wanted = new Set();
    tree.forEach((group) => {
      const text = String(group?.name || '').toLowerCase();
      if (/game|entertainment|gaming/.test(text)) {
        (group.categories || []).forEach((category) => {
          (category.product_codes || []).forEach((code) => wanted.add(String(code)));
        });
      }
    });
    return Object.values(products).filter((p) => {
      if (!p || p.is_active === false || !p.code) return false;
      const text = `${p.name || ''} ${p.description || ''} ${p.note || ''} ${p.code || ''}`.toLowerCase();
      return wanted.has(String(p.code)) || /game|entertainment|gaming|pubg|free.?fire|mobile.?legends|roblox|steam|playstation|xbox|nintendo|uc|diamond/.test(text);
    }).filter((p) => {
      const fields = Array.isArray(p.fields) ? p.fields : [];
      const account = fields.find((f) => f && (f.role === 'account' || f.id === 'player_id' || f.id === 'account'));
      const pricing = fields.find((f) => f && (f.role === 'pricing' || f.type === 'select'));
      return !!account && !!pricing;
    });
  })();

  const usingDynamic = !!catalog?.providerId && dynamicProducts.length > 0;
  const selectedProduct = usingDynamic
    ? dynamicProducts.find((p) => String(p.code) === String(serviceData.gameKey))
    : null;

  useEffect(() => {
    let alive = true;
    setOptions([]);
    setOptionsError('');
    if (!usingDynamic || !selectedProduct) return () => { alive = false; };
    const fields = Array.isArray(selectedProduct.fields) ? selectedProduct.fields : [];
    const pricing = fields.find((f) => f && (f.role === 'pricing' || f.type === 'select'));
    if (!pricing?.id) return () => { alive = false; };
    setOptionsLoading(true);
    apiProviderService.getIimmpactOptions({
      providerId: catalog.providerId,
      productCode: selectedProduct.code,
      fieldId: pricing.id,
      accountNumber: '',
    }).then((data) => {
      if (alive) setOptions(Array.isArray(data?.items) ? data.items : []);
    }).catch((e) => {
      if (alive) setOptionsError(e?.message || 'Unable to load IIMMPACT packages.');
    }).finally(() => {
      if (alive) setOptionsLoading(false);
    });
    return () => { alive = false; };
  }, [usingDynamic, selectedProduct?.code, catalog?.providerId]);

  if (step === 0) {
    if (catalogLoading) return <FormLabel>Loading IIMMPACT Games & Entertainment…</FormLabel>;
    if (catalog?.providerId) {
      if (!usingDynamic) return <FormLabel>{catalogError || 'IIMMPACT has no matching game or entertainment products for Malaysia. Other IIMMPACT products are kept out of this grid.'}</FormLabel>;
      return (
        <View>
          <FormLabel>Choose a Game / Entertainment Product</FormLabel>
          <Grid3>
            {dynamicProducts.map((p) => (
              <OperatorCard
                key={p.code}
                name={p.name}
                logo={p.image_url}
                initials="🎮"
                selected={serviceData.gameKey === p.code}
                onPress={() => updateServiceData({
                  country: 'MY', gameKey: p.code, game: p.name,
                  package: null, packageId: null, amount: null,
                  playerId: '', serverId: '', operatorCode: p.code,
                })}
              />
            ))}
          </Grid3>
          {!!catalogError && <FormLabel>{catalogError}</FormLabel>}
        </View>
      );
    }
    return (
      <View>
        <FormLabel>Choose a game</FormLabel>
        <Grid3>
          {GAME_TOP_UPS.map((g) => (
            <OperatorCard key={g.key} name={g.name} logo={g.logo} initials={g.emoji}
              selected={serviceData.gameKey === g.key}
              onPress={() => {
                updateServiceData({
                  country: 'MY', gameKey: g.key, game: g.name,
                  package: null, packageId: null, amount: null,
                  playerId: '', serverId: '',
                });
                nextStep();
              }} />
          ))}
        </Grid3>
      </View>
    );
  }

  if (step === 1) {
    if (usingDynamic) {
      if (!selectedProduct) return <FormLabel>Please choose a product first.</FormLabel>;
      if (optionsLoading) return <FormLabel>Loading live IIMMPACT packages…</FormLabel>;
      if (optionsError) return <FormLabel>{optionsError}</FormLabel>;
      return (
        <View>
          <FormLabel>{selectedProduct.name} — choose a package</FormLabel>
          {options.map((p) => {
            const price = Number(p?.price?.amount ?? p?.denomination);
            return (
              <PackageCard
                key={p.code}
                name={p.label || p.name || String(p.code)}
                price={price}
                currency={p?.price?.currency || selectedProduct.denomination_currency || 'MYR'}
                selected={String(serviceData.packageId) === String(p.code)}
                onPress={() => updateServiceData({
                  package: p.label || p.name || String(p.code),
                  packageId: p.code,
                  amount: Number(p.denomination ?? price),
                  operatorCode: selectedProduct.code,
                })}
              />
            );
          })}
          {!options.length && <FormLabel>No live IIMMPACT packages are available right now.</FormLabel>}
        </View>
      );
    }
    const game = gameByKey(serviceData.gameKey);
    if (!game) return <FormLabel>Please choose a game first.</FormLabel>;
    return <View><FormLabel>{`${game.name} — choose a pack`}</FormLabel>{game.packs.map((p) => (
      <PackageCard key={p.id} name={p.name} price={p.price} currency="MYR"
        selected={serviceData.packageId === p.id}
        onPress={() => updateServiceData({ package: p.name, packageId: p.id, amount: p.price })} />
    ))}</View>;
  }

  if (step === 2) {
    if (usingDynamic) {
      if (!selectedProduct) return <FormLabel>Please choose a product first.</FormLabel>;
      const accountField = (selectedProduct.fields || []).find((f) => f && (f.role === 'account' || f.id === 'player_id' || f.id === 'account'));
      return (
        <View>
          <FormLabel>{accountField?.label || 'Player / Account ID'}</FormLabel>
          <FormInput
            placeholder={accountField?.placeholder || 'Enter account or player ID'}
            value={serviceData.playerId || ''}
            onChangeText={(v) => updateServiceData({ playerId: v })}
            autoCapitalize="none"
            keyboardType={accountField?.input_mode === 'numeric' ? 'number-pad' : 'default'}
          />
          <Text style={{ fontSize: 11.5, lineHeight: 17, opacity: 0.7, marginBottom: 12 }}>
            Check the ID before you continue. IIMMPACT fulfils the selected product for this account.
          </Text>
          <SummaryCard title={selectedProduct.name}
            rows={[{ label: 'Package', value: serviceData.package || '—' }, { label: accountField?.label || 'Account', value: serviceData.playerId || '—' }]}
            totalLabel="Wallet deduction"
            totalValue={`MYR ${Number(serviceData.amount || 0).toFixed(2)}`} />
        </View>
      );
    }
    const game = gameByKey(serviceData.gameKey);
    if (!game) return <FormLabel>Please choose a game first.</FormLabel>;
    const pack = packById(game.key, serviceData.packageId);
    return <View><FormLabel>{game.playerIdLabel}</FormLabel><FormInput placeholder={game.playerIdHint} value={serviceData.playerId || ''} onChangeText={(v) => updateServiceData({ playerId: v })} autoCapitalize="none" />
      {!!game.needsServer && <><FormLabel>{game.serverLabel}</FormLabel><FormInput placeholder={game.serverHint} value={serviceData.serverId || ''} onChangeText={(v) => updateServiceData({ serverId: v })} autoCapitalize="none" /></>}
      <Text style={{ fontSize: 11.5, lineHeight: 17, opacity: 0.7, marginBottom: 12 }}>Check the ID before you continue. A top-up sent to the wrong ID cannot be reversed.</Text>
      {!!pack && <SummaryCard title={game.name} rows={[{ label: 'Pack', value: pack.name }, { label: game.playerIdLabel, value: serviceData.playerId || '—' }]} totalLabel="Wallet deduction" totalValue={`MYR ${Number(pack.price).toFixed(2)}`} />}
    </View>;
  }

  return null;
}
export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.gameKey) return 'Please choose a game or entertainment product.';
  if (step === 1 && !serviceData.packageId) return 'Please choose a package.';
  if (step === 2) {
    const game = gameByKey(serviceData.gameKey);
    if (!(serviceData.playerId || '').trim()) return `Please enter your ${game ? game.playerIdLabel : 'player / account ID'}.`;
    if (game && game.needsServer && !(serviceData.serverId || '').trim()) return `Please enter your ${game.serverLabel}.`;
  }
  return null;
}
