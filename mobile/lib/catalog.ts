import 'react-native-url-polyfill/auto';
import {createClient} from '@supabase/supabase-js';
const url='https://yyxobksldeifjlxjovak.supabase.co';
// Public client key only. Never embed a service-role key in a mobile build.
const key='sb_publishable_zcDehU_XlndtiGlKvDpIEQ_7L8gLo92';
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
export type Product={id:string;name:string;description:string|null;category:string;price_cents:number;stock_qty:number|null;image_url:string|null};
export async function fetchProducts():Promise<Product[]>{const {data,error}=await client.from('shop_products').select('id,name,description,category,price_cents,stock_qty,image_url').eq('is_active',true).order('name');if(error)throw error;return data||[];}
