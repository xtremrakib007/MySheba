import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import * as chatService from '../firebase/chatService';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';

export default function SupportChatScreen() {
  const { colors, brandGradient } = useTheme();
  const { authUser, profile, activeChatId, activeChatName, goBackOrHome } = useApp();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const chatId = activeChatId || authUser?.uid;
  const sender = useMemo(() => ({
    uid: authUser?.uid,
    role: ['admin', 'superadmin', 'dealer', 'reseller'].includes(profile?.role) ? 'staff' : 'customer',
    name: profile?.name || authUser?.displayName || authUser?.email || '',
    customerName: activeChatName || '',
  }), [authUser, profile, activeChatName]);

  useEffect(() => {
    if (!chatId || !authUser?.uid) return undefined;
    setLoading(true);
    chatService.ensureChat({ uid: chatId, name: activeChatName || profile?.name || '', phone: profile?.phone || '' }).catch(() => {});
    const unsub = chatService.subscribeMessages(chatId, (list) => { setMessages(list); setLoading(false); }, (err) => { console.log('[support-chat] messages:', err?.code || err?.message || err); setLoading(false); });
    chatService.markChatRead(chatId, sender.role).catch(() => {});
    return unsub;
  }, [chatId, authUser?.uid, activeChatName, profile?.name, profile?.phone, sender.role]);

  const send = async () => {
    const value = text.trim();
    if (!value || !chatId || !sender.uid || sending) return;
    setSending(true); setText('');
    try { await chatService.sendMessage(chatId, sender, value); }
    catch (err) { setText(value); showAlert('Message failed', err?.message || 'Please try again.'); }
    finally { setSending(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { backgroundColor: brandGradient?.[0] || colors.primary }]}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.headerText}><Text style={styles.title}>{activeChatName || (sender.role === 'staff' ? 'Support Chat' : 'MySheba Support')}</Text><Text style={styles.subtitle}>{sender.role === 'staff' ? 'Customer Support' : 'MySheba Support'}</Text></View>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : <FlatList data={messages} keyExtractor={(item) => item.id} contentContainerStyle={messages.length ? styles.list : styles.emptyList} keyboardShouldPersistTaps="handled" renderItem={({ item }) => { const mine = item.senderId === sender.uid; const label = item.type === 'text' ? item.text : (item.type === 'image' ? '📷 Photo' : item.type === 'video' ? '🎥 Video' : item.type === 'voice' ? '🎤 Voice message' : '📄 Document'); return <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}><View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}><Text style={[styles.message, mine ? styles.messageMine : styles.messageOther]}>{label}</Text></View></View>; }} ListEmptyComponent={<View><Text style={styles.emptyTitle}>Start a conversation</Text><Text style={styles.emptyText}>Send a message to MySheba Support.</Text></View>} />}
      <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Write a message..." placeholderTextColor={colors.textSecondary} style={styles.input} multiline maxLength={4000} /><TouchableOpacity disabled={!text.trim() || sending} onPress={send} style={[styles.send, (!text.trim() || sending) && styles.sendDisabled]}><Text style={styles.sendText}>{sending ? '…' : '➤'}</Text></TouchableOpacity></View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) { return StyleSheet.create({ screen:{flex:1,backgroundColor:colors.bg}, header:{minHeight:68,flexDirection:'row',alignItems:'center',paddingHorizontal:14,overflow:'hidden'}, back:{width:38,height:44,alignItems:'center',justifyContent:'center'}, backText:{color:'#fff',fontSize:36,lineHeight:40}, headerText:{flex:1,marginLeft:4}, title:{color:'#fff',fontSize:18,fontWeight:'800'}, subtitle:{color:'rgba(255,255,255,0.82)',fontSize:12,marginTop:2}, center:{flex:1,alignItems:'center',justifyContent:'center'}, list:{padding:14,paddingBottom:12}, emptyList:{flexGrow:1,alignItems:'center',justifyContent:'center',padding:30}, emptyTitle:{color:colors.text,fontSize:18,fontWeight:'800',textAlign:'center'}, emptyText:{color:colors.textSecondary,fontSize:14,marginTop:6,textAlign:'center'}, row:{flexDirection:'row',marginVertical:4}, rowMine:{justifyContent:'flex-end'}, rowOther:{justifyContent:'flex-start'}, bubble:{maxWidth:'82%',borderRadius:18,paddingHorizontal:13,paddingVertical:9}, bubbleMine:{backgroundColor:colors.primary,borderBottomRightRadius:5}, bubbleOther:{backgroundColor:colors.surfaceElevated||colors.surface,borderBottomLeftRadius:5}, message:{fontSize:15,lineHeight:20}, messageMine:{color:colors.onPrimary||'#fff'}, messageOther:{color:colors.text}, composer:{flexDirection:'row',alignItems:'flex-end',gap:8,padding:10,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,backgroundColor:colors.surface}, input:{flex:1,minHeight:44,maxHeight:120,borderRadius:22,borderWidth:1,borderColor:colors.border,color:colors.text,backgroundColor:colors.bg,paddingHorizontal:16,paddingVertical:10,fontSize:15}, send:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary}, sendDisabled:{opacity:.45}, sendText:{color:colors.onPrimary||'#fff',fontSize:20,fontWeight:'800'} }); }
