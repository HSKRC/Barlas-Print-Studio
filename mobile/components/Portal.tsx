import React,{useRef,useState} from 'react';
import {View,Text,Pressable,ActivityIndicator,StyleSheet,BackHandler,Platform,Linking} from 'react-native';
import {WebView} from 'react-native-webview';
import {useFocusEffect} from 'expo-router';
const BASE='https://barlasprintstudio.com.au/';
const allowed=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='barlasprintstudio.com.au'||u.hostname==='www.barlasprintstudio.com.au'||u.hostname==='yyxobksldeifjlxjovak.supabase.co'||u.hostname==='checkout.stripe.com');}catch{return false;}};
export default function Portal({page,title}:{page:string;title:string}){
 const ref=useRef<WebView>(null);const [canBack,setCanBack]=useState(false),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false);
 useFocusEffect(React.useCallback(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{if(canBack){ref.current?.goBack();return true;}return false;});return()=>listener.remove();},[canBack]));
 return <View style={s.root}><View style={s.toolbar}><Text style={s.title}>{title}</Text><Pressable accessibilityRole="button" onPress={()=>{setFailed(false);ref.current?.reload();}}><Text style={s.action}>Refresh</Text></Pressable></View>
 <WebView ref={ref} source={{uri:BASE+page}} style={s.web} sharedCookiesEnabled thirdPartyCookiesEnabled javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} allowsBackForwardNavigationGestures onLoadStart={()=>{setBusy(true);setFailed(false);}} onLoadEnd={()=>setBusy(false)} onError={()=>{setFailed(true);setBusy(false)}} onNavigationStateChange={state=>setCanBack(state.canGoBack)} onShouldStartLoadWithRequest={request=>{if(allowed(request.url)||request.url==='about:blank')return true;if(/^https?:\/\//.test(request.url))void Linking.openURL(request.url);return false;}}/>
 {busy&&<View style={s.loading}><ActivityIndicator size="large"/><Text>Loading...</Text></View>}
 {failed&&<View style={s.error}><Text>Unable to load this page. Check your connection.</Text><Pressable style={s.retry} onPress={()=>{setFailed(false);ref.current?.reload();}}><Text style={s.retryText}>Try again</Text></Pressable></View>}
 </View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#fff'},toolbar:{backgroundColor:'#171717',paddingHorizontal:16,paddingVertical:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},title:{color:'#fff',fontWeight:'700',fontSize:16},action:{color:'#fff',textDecorationLine:'underline'},web:{flex:1},loading:{position:'absolute',top:58,left:0,right:0,padding:20,alignItems:'center',backgroundColor:'#ffffffee'},error:{position:'absolute',top:58,left:0,right:0,padding:25,backgroundColor:'#fff',alignItems:'center'},retry:{backgroundColor:'#222',padding:12,marginTop:12,borderRadius:8},retryText:{color:'#fff'}});
