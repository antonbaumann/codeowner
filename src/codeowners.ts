import {commitsAffectingFile, getOwnerOfCommit, Owner, readFileAtCommit} from './git';
import {Declaration, findDeclaration, findSpans} from './parse';
import {readFile} from './util';

export const codeOwners = (filePath: string, line: number, depth: number): Promise<{def: Declaration; owners: Owner[]}> => {
    const aux = (def: Declaration, commitHashes: string[], commitIndex: number): Promise<Owner[]> => {
        if (depth && commitIndex >= depth || commitIndex >= commitHashes.length)
            return new Promise(resolve => resolve([]));

        return readFileAtCommit(filePath, commitHashes[commitIndex])
            .then(sourceCodeAtCommit => {
                const suffix = filePath.split('.').pop();
                const spans = findSpans(suffix, sourceCodeAtCommit, def);

                // if current commit does not contain def
                // assume no earlier commit contains def
                if (spans.length == 0) return [];

                return Promise.all(spans.map(span => getOwnerOfCommit(filePath, commitHashes[commitIndex], span)))
                    .then(mergeDuplicateOwners)
                    .then(owners => {
                        return aux(def, commitHashes,commitIndex+1).then(newOwners => {
                            return mergeDuplicateOwners([...owners, ...newOwners]);
                        });
                    }).catch(err => {
                        console.error(err);
                        return [];
                    });
            }).catch(() => {
                // file could not be read at HEAD~commitIndex
                return [];
            });
    };

    return commitsAffectingFile(filePath).then(commitHashes => {
        return readFile(filePath).then(sourceCode => {
            const suffix = filePath.split('.').pop();
            const def = findDeclaration(suffix, sourceCode, line);
            return aux(def, commitHashes, 0).then(owners => ({def, owners}));
        }).then(result => ({...result, owners: result.owners.sort((a, b) => a.score < b.score ? 1 : -1)}));
    });
};

const mergeDuplicateOwners = (owners: Owner[]): Owner[] => {
    const emails = new Set(owners.map(owner => owner.author.email));

    return Array.from(emails, email => {
        const sameOwners = owners.filter(owner => owner.author.email === email);
        return {
            author: sameOwners[0].author,
            score: sameOwners.map(owner => owner.score).reduce((ovr, score) => ovr + score)
        };
    });
};
