import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Image, Modal, TextInput } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import * as virtualGiftService from '../firebase/virtualGiftService';
import { showAlert } from '../utils/appAlert';

export default function VirtualGiftScreen() {
  const { colors } = useTheme();
  const { authUser, activeDirectChatUid, activeDirectChatName, activeGroupId, activeRoomId, setScreen } = useApp();
  const [gifts, setGifts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [recipient, setRecipient] = useState(activeDirectChatUid || '');
  const [recipientName, setRecipientName] = useState(activeDirectChatName || '');
  const [modal, setModal] = useState(false);

  useEffect(() => virtualGiftService.subscribeEnabledVirtualGifts(setGifts, () => {}), []);
  const isMulti = !!activeGroupId || !!activeRoomId;

  const choose = (gift) => { setSelected(gift); if (isMulti) setModal(true); else send(gift, recipient, recipientName || 'Recipient'); };
  const send = async (gift, uid, name) => {
    if (!uid) return showAlert('MySheba', 'Please select a recipient first.');
    // The catalogue is intentionally separate from Game Points Gifts. The
    // final wallet debit is performed by the secure virtual-gift callable
    // when backend gift payments are enabled; this screen only prepares the
    // gift selection and recipient context.
    showAlert('🎁 Gift selected', `${gift.name} → ${name}\nPrice: ${gift.price} pts`);
    setModal(false);
  };

  const s = styles(colors);
  return <View style={s.screen}>
    <View style={s.header}><TouchableOpacity onPress={() => setScreen('chat')}><Text style={s.back}>←</Text></TouchableOpacity><Text style={s.title}>🎁 Send a Gift</Text></View>
    <FlatList data={gifts} keyExtractor={(g) => g.id} numColumns={3} contentContainerStyle={s.grid} ListEmptyComponent={<Text style={s.empty}>No gifts are available yet.</Text>}
      renderItem={({ item }) => <TouchableOpacity style={s.gift} onPress={() => choose(item)}><View style={s.imageWrap}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={s.image} /> : <Text style={s.emoji}>🎁</Text>}</View><Text style={s.name} numberOfLines={1}>{item.name}</Text><Text style={s.price}>{item.price} pts</Text></TouchableOpacity>}/>
    />
    <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}><View style={s.backdrop}><View style={s.dialog}><Text style={s.dialogTitle}>Send {selected?.name || 'Gift'} to</Text><TextInput value={recipient} onChangeText={setRecipient} style={s.input} placeholder="Recipient user ID" placeholderTextColor="#999"/><TextInput value={recipientName} onChangeText={setRecipientName} style={s.input} placeholder="Recipient name" placeholderTextColor="#999"/><TouchableOpacity style={s.send} onPress={() => send(selected, recipient, recipientName)}><Text style={s.sendText}>Send Gift • {selected?.price || 0} pts</Text></TouchableOpacity><TouchableOpacity onPress={() => setModal(false)}><Text style={s.cancel}>Cancel</Text></TouchableOpacity></View></View></Modal>
  </View>;
}

const styles = (c) => StyleSheet.create({screen:{flex:1,backgroundColor:c.bg},header:{flexDirection:'row',alignItems:'center',gap:12,padding:12,backgroundColor:c.primary},back:{color:'white',fontSize:22},title:{color:'white',fontSize:17,fontWeight:'800'},grid:{padding:10},gift:{width:'33.33%',padding:6,alignItems:'center'},imageWrap:{width:82,height:82,borderRadius:16,backgroundColor:c.card,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.border},image:{width:72,height:72,borderRadius:14},emoji:{fontSize:42},name:{color:c.text,fontWeight:'700',fontSize:12,marginTop:5},price:{color:c.primary,fontWeight:'800',fontSize:11,marginTop:2},empty:{color:c.muted || '#777',textAlign:'center',width:'100%',padding:30},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.5)',justifyContent:'flex-end'},dialog:{backgroundColor:c.card,borderTopLeftRadius:20,borderTopRightRadius:20,padding:20},dialogTitle:{fontSize:18,fontWeight:'800',color:c.text,marginBottom:12},input:{borderWidth:1,borderColor:c.border,borderRadius:10,padding:11,color:c.text,marginBottom:9},send:{backgroundColor:c.primary,borderRadius:10,padding:13,alignItems:'center'},sendText:{color:'white',fontWeight:'800'},cancel:{textAlign:'center',color:c.primary,padding:12,fontWeight:'700'}});
