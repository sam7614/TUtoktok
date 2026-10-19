import {copyFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const [source,destination] of [['../app/coach.tsx','src/shared/Coach.tsx'],['../app/globals.css','src/shared/style.css'],['../lib/questions.ts','src/lib/questions.ts'],['../lib/site-export.ts','src/lib/site-export.ts'],['../public/favicon.svg','public/favicon.svg']]){
 const target=path.join(root,destination);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,source),target);
}
