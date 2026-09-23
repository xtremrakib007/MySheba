import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const validateStep = () => null;

export default function EntertainmentStep() {
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>🎮</Text>
      <Text style={styles.title}>Entertainment</Text>
      <Text style={styles.status}>Coming Soon</Text>
      <Text style={styles.body}>
        Game recharge, digital/game vouchers, music and entertainment, and streaming/TV services will be available here.
      </Text>
      <Text style={styles.note}>
        A live provider must be configured by Superadmin before purchases can be processed. No manual or simulated purchase is available.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  card:{padding:20,borderRadius:14,backgroundColor:'#fff',alignItems:'center',marginTop:8},
  icon:{fontSize:44},title:{fontSize:22,fontWeight:'800',marginTop:8},
  status:{marginTop:10,fontSize:16,fontWeight:'800'},body:{textAlign:'center',marginTop:10,lineHeight:21},
  note:{textAlign:'center',marginTop:14,fontSize:12,opacity:.65,lineHeight:18}
});