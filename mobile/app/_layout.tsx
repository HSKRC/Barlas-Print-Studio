import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
export default function Layout(){return <><StatusBar style="light"/><Stack screenOptions={{headerStyle:{backgroundColor:'#171717'},headerTintColor:'#fff',headerTitleStyle:{fontWeight:'700'}}}/></>;}
