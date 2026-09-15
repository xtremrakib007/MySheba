import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as chatService from '../firebase/chatService';

function formatWhen(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000), now = new Date();
  if (d.toDateString() === now.toDateString()) { let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0'); const suffix = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m} ${suffix}`; }
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

// Staff-side Support Chat inbox. There is intentionally no Direct/Group/Room tab.
export default function ChatListScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, openChat } = useApp();
  const [chats, setChats] = useState([]);
  useEffect(() => chatService.subscribeAllChats((list) => setChats(list), (err) => console.log('[support-chat] inbox:', err?.code || err?.message || err)), []);
  const visible = chats.filter((c) => c.lastMessage);
  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor /><TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.headerTitle}>Support Chats</Text>
    </LinearGradient>
    <FlatList data={visible} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={styles.empty}>No support conversations yet</Text>} renderItem={({item}) => {
      const name = item.customerName || item.customerPhone || 'Customer', unread = item.unreadForStaff || 0;
      return <TouchableOpacity style={styles.row} onPress={() => openChat(item.id, name)}><View style={styles.avatar}><Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text></View><View style={styles.rowBody}><View style={styles.rowTop}><Text style={styles.rowName} numberOfLines={1}>{name}</Text><Text style={styles.rowTime}>{formatWhen(item.lastMessageAt)}</Text></View><View style={styles.rowTop}><Text style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]} numberOfLines={1}>{item.lastSenderRole === 'staff' ? 'You: ' : ''}{item.lastMessage}</Text>{unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}</View></View></TouchableOpacity>;
    }} />
  </View>;
}

function createStyles(colors) { return StyleSheet.create({ screen:{flex:1,backgroundColor:colors.bg}, header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:colors.primary,overflow:'hidden'}, backBtn:{padding:4}, backText:{color:'#fff',fontSize:20}, headerTitle:{flex:1,color:'#fff',fontWeight:'700',fontSize:16,marginLeft:10}, list:{paddingBottom:20}, empty:{textAlign:'center',color:colors.textSecondary,paddingVertical:40}, row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,paddingHorizontal:16,backgroundColor:colors.card,borderBottomWidth:1,borderBottomColor:colors.border}, avatar:{width:46,height:46,borderRadius:23,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'}, avatarText:{color:'#fff',fontWeight:'700',fontSize:17}, rowBody:{flex:1}, rowTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:2}, rowName:{fontSize:14,fontWeight:'600',color:colors.text,flex:1,marginRight:8}, rowTime:{fontSize:11,color:colors.textSecondary}, rowPreview:{fontSize:12,color:colors.textSecondary,flex:1,marginRight:8}, rowPreviewUnread:{color:colors.text,fontWeight:'600'}, badge:{backgroundColor:colors.success,borderRadius:radius.pill,minWidth:20,height:20,alignItems:'center',justifyContent:'center',paddingHorizontal:5}, badgeText:{color:'#fff',fontSize:10,fontWeight:'700'} }); }
