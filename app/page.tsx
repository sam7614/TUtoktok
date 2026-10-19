import Coach from './coach';
import { getChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
 const user = await getChatGPTUser();
 return <Coach storageScope={user?.userId ?? 'local'} />;
}
