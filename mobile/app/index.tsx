import {router} from 'expo-router';
import React,{useEffect,useMemo,useState} from 'react';
import {View,Text,ScrollView,Pressable,StyleSheet,Linking,TextInput,ActivityIndicator,RefreshControl} from 'react-native';
import {fetchProducts,type Product} from '../lib/catalog';
const website='https://barlasprintstudio.com.au';
const money=(c:number)=>'$'+(c/100).toFixed(2)+' AUD';
export default function Home(){
 const [products,setProducts]=useState<Product[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[cart,setCart]=useState<Record<string,number>>({});
 const refresh=async()=>{setLoading(true);setError('');try{setProducts(await fetchProducts());}catch{setError('Live catalogue unavailable. You can still browse our website.');}finally{setLoading(false);}};
 useEffect(()=>{void refresh();},[]);
 const visible=useMemo(()=>products.filter(p=>(p.name+' '+p.category+' '+(p.description||'')).toLowerCase().includes(search.toLowerCase())),[products,search]);
 const count=Object.values(cart).reduce((s,n)=>s+n,0);
 const total=products.reduce((s,p)=>s+(cart[p.id]||0)*p.price_cents,0);
 const add=(p:Product)=>setCart(old=>({...old,[p.id]:Math.min(p.stock_qty==null?100:p.stock_qty,100,(old[p.id]||0)+1)}));
 const remove=(id:string)=>setCart(old=>{const next={...old};if((next[id]||0)<=1)delete next[id];else next[id]--;return next;});
 return <ScrollView style={s.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh}/> }>
 <Text style={s.logo}>BPS</Text><Text style={s.title}>BARLAS print studio</Text><Text style={s.subtitle}>Printing & signage · Dandenong, Victoria</Text>
 <View style={s.links}><Pressable onPress={()=>Linking.openURL(website+'/quote.html')} style={s.smallButton}><Text style={s.buttonText}>Custom Quote</Text></Pressable><Pressable onPress={()=>Linking.openURL(website+'/account.html')} style={s.smallButton}><Text style={s.buttonText}>My Account</Text></Pressable></View>
 <Text style={s.heading}>Shop & Services</Text><View style={s.links}>{([['/shop','Shop & Checkout'],['/quote','Upload & Quote'],['/account','My Account'],['/orders','Track Orders'],['/manage','Manage Products'],['/admin','Admin Dashboard'],['/invoices','Invoices']] as const).map(([path,label])=><Pressable key={path} style={s.smallButton} onPress={()=>router.push(path)}><Text style={s.buttonText}>{label}</Text></Pressable>)}</View><Text style={s.heading}>Live Print Shop</Text><TextInput accessibilityLabel="Search products" placeholder="Search products..." style={s.search} value={search} onChangeText={setSearch}/>
 {loading&&<ActivityIndicator/>}{!!error&&<Text style={s.error}>{error}</Text>}
 {!loading&&visible.map(p=><View key={p.id} style={s.card}><Text style={s.category}>{p.category}</Text><Text style={s.product}>{p.name}</Text><Text style={s.description}>{p.description||'Available from Barlas Print Studio.'}</Text><Text style={s.price}>{money(p.price_cents)}</Text><Text style={s.description}>{p.stock_qty===0?'Out of stock':p.stock_qty==null?'Availability confirmed after ordering':'Stock: '+p.stock_qty}</Text><View style={s.links}><Pressable disabled={p.stock_qty===0} style={[s.smallButton,p.stock_qty===0&&s.disabled]} onPress={()=>add(p)}><Text style={s.buttonText}>Add to list</Text></Pressable>{(cart[p.id]||0)>0&&<Pressable style={s.outlineButton} onPress={()=>remove(p.id)}><Text>Remove one ({cart[p.id]})</Text></Pressable>}</View></View>)}
 {!loading&&!error&&!visible.length&&<Text style={s.description}>No matching products. Pull down to refresh.</Text>}
 <Text style={s.heading}>Enquiry list ({count})</Text><Text style={s.description}>Estimated product subtotal: {money(total)}. Final price, delivery and availability are confirmed on the website.</Text>
 <Pressable style={s.button} onPress={()=>Linking.openURL(website+'/shop.html#products')}><Text style={s.buttonText}>Open secure website shop to order</Text></Pressable>
 <Text style={s.note}>This list is not a submitted order and does not transfer into the website cart. Sign in and complete checkout on the website. No payment is collected in this app.</Text>
 <Pressable onPress={()=>Linking.openURL(website+'/track.html')}><Text style={s.link}>Track an existing order</Text></Pressable><Pressable onPress={()=>Linking.openURL(website+'/contact.html')}><Text style={s.link}>Contact the studio</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f6f6f6',padding:20},logo:{fontSize:42,fontWeight:'900',color:'#222',marginTop:25},title:{fontSize:23,fontWeight:'700'},subtitle:{color:'#666',marginTop:6,marginBottom:18},heading:{fontSize:21,fontWeight:'700',marginTop:20,marginBottom:12},search:{backgroundColor:'#fff',padding:13,borderRadius:10,marginBottom:15},card:{backgroundColor:'#fff',borderRadius:14,padding:18,marginBottom:12},category:{fontSize:11,color:'#666',textTransform:'uppercase'},product:{fontSize:18,fontWeight:'700',marginTop:5},description:{color:'#666',marginVertical:8},price:{fontSize:17,fontWeight:'700'},links:{flexDirection:'row',gap:10,flexWrap:'wrap',marginTop:8},smallButton:{backgroundColor:'#202020',padding:12,borderRadius:9},outlineButton:{padding:12,borderWidth:1,borderColor:'#bbb',borderRadius:9},button:{backgroundColor:'#202020',padding:15,borderRadius:9,alignItems:'center',marginTop:12},disabled:{opacity:.4},buttonText:{color:'#fff',fontWeight:'700'},note:{fontSize:12,color:'#777',marginTop:12},link:{color:'#333',textDecorationLine:'underline',marginTop:22,marginBottom:8},error:{color:'#a22',marginBottom:10}});
