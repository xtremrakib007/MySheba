import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import * as virtualGiftService from '../firebase/virtualGiftService';

const EMPTY = { name: '', description: '', price: '', imageUrl: '', animationUrl: '', animationType: 'gif', sortOrder: '0', enabled: true };

export default function VirtualGiftAdminScreen() {
  const { colors, brandGradient } = useTheme();
  const { profile, goBackOrHome, authUser } = useApp();
  const [gifts, setGifts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => virtualGiftService.subscribeVirtualGifts(setGifts, () => {}), []);

  if (profile?.role !== 'superadmin') {
    return <View style={styles(colors).center}><Text style={styles(colors).denied}>Superadmin access only.</Text></View>;
  }

  const pickAsset = async (kind) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      const url = await virtualGiftService.uploadVirtualGiftAsset(asset.uri, authUser.uid, kind, asset.mimeType);
      setForm((f) => ({ ...f, [kind === 'image' ? 'imageUrl' : 'animationUrl']: url }));
    } catch (e) { showAlert('MySheba', 'Could not upload the gift asset.'); }
  };

  const save = async () => {
    if (!form.name.trim() || Number(form.price) < 0) return showAlert('MySheba', 'Enter a gift name and valid price.');
    setSaving(true);
    try {
      if (editing) await virtualGiftService.updateVirtualGift(editing, form);
      else await virtualGiftService.createVirtualGift(form);
      setForm(EMPTY); setEditing(null);
    } catch (e) { showAlert('MySheba', e.message || 'Could not save gift.'); }
    finally { setSaving(false); }
  };

  const edit = (g) => setForm({ ...EMPTY, ...g, price: String(g.price ?? ''), sortOrder: String(g.sortOrder ?? 0) }) || setEditing(g.id);
  const remove = (g) => showAlert('Delete gift?', g.name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => virtualGiftService.deleteVirtualGift(g.id).catch(() => showAlert('MySheba', 'Delete failed.')) },
  ]);

  const s = styles(colors);
  return <View style={s.screen}>
    <View style={[s.header, { backgroundColor: colors.primary }]}><HeaderDecor /><TouchableOpacity onPress={goBackOrHome}><Text style={s.back}>←</Text></TouchableOpacity><Text style={s.title}>🎁 Virtual Gifts</Text></View>
    <FlatList data={gifts} keyExtractor={(g) => g.id} contentContainerStyle={s.list} ListHeaderComponent={<>
      <Text style={s.section}>Add / Edit Gift</Text>
      {['name','description','price','sortOrder'].map((key) => <TextInput key={key} style={s.input} value={String(form[key] ?? '')} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} placeholder={key === 'name' ? 'Gift name (Rose, Crown...)' : key === 'description' ? 'Description' : key === 'price' ? 'Price (wallet points)' : 'Display order'} placeholderTextColor="#999" keyboardType={key === 'price' || key === 'sortOrder' ? 'numeric' : 'default'} />)}
      <View style={s.uploadRow}><TouchableOpacity style={s.upload} onPress={() => pickAsset('image')}><Text>🖼️ Gift Photo</Text></TouchableOpacity><TouchableOpacity style={s.upload} onPress={() => pickAsset('animation')}><Text>✨ Animation</Text></TouchableOpacity></View>
      {!!form.imageUrl && <Image source={{ uri: form.imageUrl }} style={s.preview} />}
      <View style={s.switchRow}><Text style={s.label}>Enabled</Text><Switch value={form.enabled !== false} onValueChange={(v) => setForm((f) => ({ ...f, enabled: v }))} /></View>
      <TouchableOpacity style={s.save} onPress={save} disabled={saving}><Text style={s.saveText}>{saving ? 'Saving…' : editing ? 'Update Gift' : 'Add Gift'}</Text></TouchableOpacity>
      {!!editing && <TouchableOpacity onPress={() => { setEditing(null); setForm(EMPTY); }}><Text style={s.cancel}>Cancel edit</Text></TouchableOpacity>}
      <Text style={s.section}>Gift Catalogue</Text>
    </>}
      renderItem={({ item }) => <View style={s.card}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={s.thumb} /> : <Text style={s.emoji}>🎁</Text>}<View style={{ flex: 1 }}><Text style={s.name}>{item.name}</Text><Text style={s.meta}>{item.price} pts · {item.enabled === false ? 'Disabled' : 'Enabled'}</Text></View><TouchableOpacity onPress={() => { setEditing(item.id); edit(item); }}><Text style={s.action}>Edit</Text></TouchableOpacity><TouchableOpacity onPress={() => remove(item)}><Text style={s.delete}>Delete</Text></TouchableOpacity></View>}
    />
  </View>;
}

const styles = (c) => StyleSheet.create({ screen:{flex:1,backgroundColor:c.bg},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:c.bg},denied:{color:c.text,fontWeight:'700'},header:{flexDirection:'row',alignItems:'center',gap:12,padding:12,overflow:'hidden'},back:{color:'white',fontSize:22},title:{color:'white',fontSize:17,fontWeight:'700'},list:{padding:14,paddingBottom:40},section:{fontSize:15,fontWeight:'800',color:c.text,marginBottom:10,marginTop:8},input:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:10,padding:11,color:c.text,marginBottom:9},uploadRow:{flexDirection:'row',gap:8,marginBottom:10},upload:{flex:1,padding:12,borderRadius:10,backgroundColor:c.card,borderWidth:1,borderColor:c.border,alignItems:'center'},preview:{width:90,height:90,borderRadius:12,marginBottom:10},switchRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},label:{color:c.text,fontWeight:'700'},save:{backgroundColor:c.primary,padding:13,borderRadius:10,alignItems:'center',marginTop:10},saveText:{color:'white',fontWeight:'800'},cancel:{textAlign:'center',color:c.primary,padding:10},card:{flexDirection:'row',alignItems:'center',gap:9,padding:10,borderRadius:12,backgroundColor:c.card,marginBottom:8},thumb:{width:50,height:50,borderRadius:10},emoji:{fontSize:32,width:50,textAlign:'center'},name:{fontWeight:'800',color:c.text},meta:{fontSize:11,color:c.muted || '#777',marginTop:3},action:{color:c.primary,fontWeight:'700',padding:5},delete:{color:c.error || '#d32f2f',fontWeight:'700',padding:5}});
