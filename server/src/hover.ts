import {
    TextDocumentPositionParams,
    Hover,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, PerlSymbolKind } from "./types";
import { getSymbol, lookupSymbol } from "./utils";
import { refineForSignature } from "./signatures";
import Uri from 'vscode-uri';

export async function getHover(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument, modMap: Map<string, string>): Promise<Hover | undefined> {

    let position = params.position
    const symbol = getSymbol(position, txtDoc);

    let elem = perlDoc.canonicalElems.get(symbol);

    if(!elem){
        const elems = lookupSymbol(perlDoc, modMap, symbol, position.line);
        if(elems.length != 1) return; // Nothing or too many things.
        elem = elems[0];
    }

    const refined = await refineForSignature(elem, perlDoc, params);

    let hoverStr = buildHoverDoc(symbol, elem, refined);
    if(!hoverStr) return; // Sometimes, there's nothing worth showing.

    const documentation = {contents: hoverStr};

    return documentation;
}

function buildHoverDoc(symbol: string, elem: PerlElem, refined: PerlElem | undefined){

    let sig = "";
    let name = elem.name;
    if(refined && refined.signature) {
        let signature = refined.signature;
        signature  = [...signature];
        if(symbol.match(/\->/)){
            signature.shift()
            name = name.replace(/::(\w+)$/, '->$1');
        }
        if(signature.length>0){
            sig = '(' + signature.join(', ') + ')';
        }
    } 

    let desc = "";
    if ([PerlSymbolKind.LocalVar, PerlSymbolKind.ImportedVar,
        PerlSymbolKind.Canonical].includes(elem.type)) {
        if (elem.typeDetail.length > 0)
            desc = "(object) " + `${elem.typeDetail}`;
        else if (/^\$self/.test(symbol))
            // We either know the object type, or it's $self
            desc = "(object) " + `${elem.package}`; 
    }
    if(!desc){
        switch (elem.type) {
        case PerlSymbolKind.ImportedSub: // inherited methods can still be subs (e.g. new from a parent)
        case PerlSymbolKind.Inherited:
            desc = `(subroutine) ${name}${sig}`;
            if (elem.typeDetail && elem.typeDetail != elem.name)
                    desc += ` (${elem.typeDetail})`;
            break;
        case PerlSymbolKind.LocalSub:
            desc = `(subroutine) ${name}${sig}`;
            break;
        case PerlSymbolKind.LocalMethod:
        case PerlSymbolKind.Method:
            desc = `(method) ${name}${sig}`;
            break;
        case PerlSymbolKind.LocalVar:
            // Not very interesting info
            // desc = `(variable) ${symbol}`;
            break;
        case PerlSymbolKind.Constant: 
            desc = `(constant) ${symbol}`;
            break;
        case PerlSymbolKind.ImportedVar: 
            desc = `${name}: ${elem.value}`;
            if (elem.package)
                desc += ` (${elem.package})` ; // Is this ever known?
            break;
        case PerlSymbolKind.ImportedHash: 
            desc = `${elem.name}  (${elem.package})`;
            break;

        case PerlSymbolKind.Package:
            desc = `(package) ${elem.name}`;
            break;
        case PerlSymbolKind.Module:
            let file = Uri.parse(elem.uri).fsPath;
            desc = `(module) ${elem.name}: ${file}`;
            break;
        case PerlSymbolKind.Label: 
            desc = `(label) ${symbol}`;
            break;
        case PerlSymbolKind.Class:
            desc = `(class) ${symbol}`;
            break;
        case PerlSymbolKind.Role:
            desc = `(role) ${symbol}`;
            break;
        case PerlSymbolKind.Field:
        case PerlSymbolKind.PathedField:
            desc = `(attribute) ${symbol}`;
            break;
        case PerlSymbolKind.Phaser: 
            desc = `(phase) ${symbol}`;
            break;
        case PerlSymbolKind.HttpRoute:
        case PerlSymbolKind.OutlineOnlySub: 
            // You cant go-to or hover on a route or outline only sub.
            break;
        case PerlSymbolKind.AutoLoadVar:
            desc = `(autoloaded) ${symbol}`
        default:
            // We should never get here
            desc = `Unknown: ${symbol}`;
            console.log(`${symbol} ISA ${elem.type}`);
            break;
        }
    }
    return desc;
}
