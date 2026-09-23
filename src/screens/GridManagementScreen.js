import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import * as gridService from '../firebase/gridManagementService';

export default function GridManagementScreen() {
  const { colors, brandGradient } = useTheme();
  const { profile, goBackOrHome, gridManagement } = useApp();
  const [busy, setBusy] = useState(null);
  const isSuperadmin = profile?.role === 'superadmin';

  const toggle = async (key, active) => {
    if (busy || !isSuperadmin) return;
    setBusy(key);
    try { await gridService.setGridActive(key, !active); }
    catch (e) { showAlert('MySheba', e?.message || 'Could not update grid status.'); }
    finally { setBusy(null); }
  };

  return <View style={[styles.screen, { backgroundColor: colors.bg }]}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor />
      <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
      <Text style={styles.title}>🧩 Grid Management</Text>
    </LinearGradient>
    {!isSuperadmin ? <View style={styles.center}><Text style={[styles.denied,{color:colors.textSecondary}]}>Only a Superadmin can manage feature grids.</Text></View> :
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.hint,{color:colors.textSecondary}]}>Deactivate any grid to hide it from every role. Changes are live and do not require an APK/AAB rebuild.</Text>
        {gridService.GRID_DEFS.map(g => {
          const active = gridService.isGridActive(gridManagement, g.key);
          return <View key={g.key} style={[styles.row,{backgroundColor:colors.card,borderColor:colors.border}]}>
            <View style={styles.info}><Text style={[styles.name,{color:colors.text}]}>{g.name}</Text><Text style={[styles.key,{color:colors.textSecondary}]}>{g.key}</Text></View>
            <TouchableOpacity disabled={busy===g.key} onPress={() => toggle(g.key, active)} style={[styles.toggle, active ? styles.on : styles.off]}>
              <Text style={styles.toggleText}>{busy===g.key ? '…' : active ? 'ACTIVE' : 'OFF'}</Text>
            </TouchableOpacity>
          </View>;
        })}
      </ScrollView>}
  </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1},header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'},back:{padding:4},backText:{color:'white',fontSize:22},title:{color:'white',fontWeight:'800',fontSize:16},
 content:{padding:14,paddingBottom:40},hint:{fontSize:12,lineHeight:18,marginBottom:12},row:{minHeight:62,borderWidth:1,borderRadius:14,paddingHorizontal:12,paddingVertical:9,marginBottom:8,flexDirection:'row',alignItems:'center'},info:{flex:1},name:{fontSize:14,fontWeight:'800'},key:{fontSize:10,marginTop:2},toggle:{minWidth:72,paddingVertical:9,paddingHorizontal:10,borderRadius:10,alignItems:'center'},on:{backgroundColor:'#00A99D'},off:{backgroundColor:'#6B7280'},toggleText:{color:'white',fontSize:10,fontWeight:'800'},center:{flex:1,alignItems:'center',justifyContent:'center',padding:20},denied:{textAlign:'center'}
});
