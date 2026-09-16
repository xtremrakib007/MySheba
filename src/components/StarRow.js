import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

// Tappable 1-5 star row - used both to submit a review and to render one.
export default function StarRow({ value, onChange, size = 22 }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={{ flexDirection: 'row' }}>
      {stars.map((s) => (
        <TouchableOpacity key={s} disabled={!onChange} onPress={() => onChange && onChange(s)}>
          <Text style={{ fontSize: size, color: s <= value ? '#F5A623' : '#DDD', marginRight: 2 }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
