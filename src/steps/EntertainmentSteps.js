import React from 'react';
import { View, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { FormLabel, Grid3, OperatorCard, FormInput, PackageCard, SummaryCard } from '../components/ui';
import { GAME_TOP_UPS, gameByKey, packById } from '../data/gameTopUps';

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
  const game = gameByKey(serviceData.gameKey);

  if (step === 0) {
    return (
      <View>
        <FormLabel>Choose a game</FormLabel>
        <Grid3>
          {GAME_TOP_UPS.map((g) => (
            <OperatorCard
              key={g.key}
              name={g.name}
              initials={g.emoji}
              selected={serviceData.gameKey === g.key}
              onPress={() => {
                // Changing game invalidates the pack: a PUBG pack id means
                // nothing under Free Fire, and leaving it set would charge for
                // a product nobody picked.
                updateServiceData({
                  gameKey: g.key, game: g.name,
                  package: null, packageId: null, amount: null,
                  playerId: '', serverId: '',
                });
                nextStep();
              }}
            />
          ))}
        </Grid3>
      </View>
    );
  }

  if (step === 1) {
    if (!game) return <FormLabel>Please choose a game first.</FormLabel>;
    return (
      <View>
        <FormLabel>{`${game.name} — choose a pack`}</FormLabel>
        {game.packs.map((p) => (
          <PackageCard
            key={p.id}
            name={p.name}
            price={p.price}
            currency="MYR"
            selected={serviceData.packageId === p.id}
            onPress={() => updateServiceData({ package: p.name, packageId: p.id, amount: p.price })}
          />
        ))}
      </View>
    );
  }

  if (step === 2) {
    if (!game) return <FormLabel>Please choose a game first.</FormLabel>;
    const pack = packById(game.key, serviceData.packageId);
    return (
      <View>
        {/* Named per game, because every one calls this something different and
            entering the wrong number is how a top-up reaches a stranger. */}
        <FormLabel>{game.playerIdLabel}</FormLabel>
        <FormInput
          placeholder={game.playerIdHint}
          value={serviceData.playerId || ''}
          onChangeText={(v) => updateServiceData({ playerId: v })}
          autoCapitalize="none"
        />
        {!!game.needsServer && (
          <>
            <FormLabel>{game.serverLabel}</FormLabel>
            <FormInput
              placeholder={game.serverHint}
              value={serviceData.serverId || ''}
              onChangeText={(v) => updateServiceData({ serverId: v })}
              autoCapitalize="none"
            />
          </>
        )}
        <Text style={{ fontSize: 11.5, lineHeight: 17, opacity: 0.7, marginBottom: 12 }}>
          Check the ID before you continue. A top-up sent to the wrong ID cannot be reversed.
        </Text>
        {!!pack && (
          <SummaryCard
            title={game.name}
            rows={[{ label: 'Pack', value: pack.name }, { label: game.playerIdLabel, value: serviceData.playerId || '—' }]}
            totalLabel="Wallet deduction"
            totalValue={`MYR ${Number(pack.price).toFixed(2)}`}
          />
        )}
      </View>
    );
  }

  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.gameKey) return 'Please choose a game.';
  if (step === 1 && !serviceData.packageId) return 'Please choose a pack.';
  if (step === 2) {
    const game = gameByKey(serviceData.gameKey);
    if (!(serviceData.playerId || '').trim()) return `Please enter your ${game ? game.playerIdLabel : 'player ID'}.`;
    // A Mobile Legends ID without its zone, or a Genshin UID without its
    // server, is not something anybody can deliver to.
    if (game && game.needsServer && !(serviceData.serverId || '').trim()) return `Please enter your ${game.serverLabel}.`;
  }
  return null;
}
