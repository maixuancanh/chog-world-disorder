// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Server-attested game records stay with each NFT, including after transfers.
/// @dev Server validates gameplay and authenticates recipe owner intent. Relayers pay gas.
contract ChogModeRegistry is EIP712, Ownable2Step {
    bytes32 public constant RESULT_TYPEHASH=keccak256("Result(bytes32 roundId,uint256 tokenId,uint8 mode,bool won,uint256 score,bytes32 challengeId,uint256 ruleVersion,uint256 epoch)");
    bytes32 public constant RECIPE_TYPEHASH=keccak256("Recipe(uint256 tokenId,address wallet,bytes32 recipeHash,bytes32 choicesHash,uint256 mastery,uint256 nonce,uint256 deadline,uint256 epoch)");
    IERC721 public immutable collection;
    address public serverSigner;
    uint256 public signerEpoch;
    struct Stats {uint256 matches;uint256 wins;uint256 totalScore;}
    struct Recipe {bytes32 recipeHash;bytes choices;uint256 mastery;uint256 version;}
    mapping(uint256=>mapping(uint8=>Stats)) public stats;
    mapping(uint256=>mapping(bytes32=>mapping(uint256=>uint256))) public dailyBest;
    mapping(bytes32=>bool) public recorded;
    mapping(uint256=>Recipe) public recipes;
    mapping(uint256=>uint256) public recipeNonce;
    event ResultRecorded(bytes32 indexed roundId,uint256 indexed tokenId,uint8 indexed mode,bool won,uint256 score,bytes32 challengeId,uint256 ruleVersion);
    event RecipeSaved(uint256 indexed tokenId,address indexed wallet,bytes32 indexed recipeHash,bytes choices,uint256 mastery,uint256 version);
    event SignerChanged(address indexed signer,uint256 epoch);
    constructor(address collection_,address signer_,address owner_) EIP712("ChogModeRegistry","1") Ownable(owner_) {
        require(block.chainid==10143,"Monad testnet only");
        require(collection_.code.length>0&&signer_!=address(0),"Invalid configuration");
        collection=IERC721(collection_);serverSigner=signer_;
    }
    function recordResult(bytes32 roundId,uint256 tokenId,uint8 mode,bool won,uint256 score,bytes32 challengeId,uint256 ruleVersion,uint256 epoch,bytes calldata signature) external {
        require(collection.ownerOf(tokenId)!=address(0),"Unknown NFT");
        require(epoch==signerEpoch,"Stale signer");
        require(roundId!=bytes32(0)&&ruleVersion>0,"Invalid round");
        require((mode==1&&score<=100&&challengeId==bytes32(0))||(mode==2&&score<=1160&&challengeId!=bytes32(0)),"Invalid result");
        bytes32 key=keccak256(abi.encode(roundId,tokenId));require(!recorded[key],"Round recorded");
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(RESULT_TYPEHASH,roundId,tokenId,mode,won,score,challengeId,ruleVersion,epoch)));
        require(ECDSA.recover(digest,signature)==serverSigner,"Invalid signature");
        recorded[key]=true;Stats storage value=stats[tokenId][mode];value.matches++;if(won)value.wins++;value.totalScore+=score;
        if(mode==2&&score>dailyBest[tokenId][challengeId][ruleVersion])dailyBest[tokenId][challengeId][ruleVersion]=score;
        emit ResultRecorded(roundId,tokenId,mode,won,score,challengeId,ruleVersion);
    }
    function saveRecipe(uint256 tokenId,address wallet,bytes32 recipeHash,bytes calldata choices,uint256 mastery,uint256 nonce,uint256 deadline,uint256 epoch,bytes calldata signature) external {
        require(collection.ownerOf(tokenId)==wallet,"Current NFT owner only");
        require(epoch==signerEpoch,"Stale signer");require(block.timestamp<=deadline,"Expired intent");
        require(nonce==recipeNonce[tokenId],"Stale recipe");require(mastery>=recipes[tokenId].mastery&&mastery<=type(uint32).max,"Invalid mastery");
        require(choices.length==128&&recipeHash==keccak256(choices),"Invalid recipe hash");
        (uint8 effect,uint8 target,uint8 modifier_,uint8 ruleVersion)=abi.decode(choices,(uint8,uint8,uint8,uint8));
        require(effect>=1&&effect<=3&&target>=1&&target<=2&&modifier_>=1&&modifier_<=4&&ruleVersion==1,"Invalid choices");
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(RECIPE_TYPEHASH,tokenId,wallet,recipeHash,keccak256(choices),mastery,nonce,deadline,epoch)));
        require(ECDSA.recover(digest,signature)==serverSigner,"Invalid signature");
        uint256 version=nonce+1;recipeNonce[tokenId]=version;recipes[tokenId]=Recipe(recipeHash,choices,mastery,version);
        emit RecipeSaved(tokenId,wallet,recipeHash,choices,mastery,version);
    }
    function setServerSigner(address signer_) external onlyOwner {require(signer_!=address(0),"Zero signer");serverSigner=signer_;signerEpoch++;emit SignerChanged(signer_,signerEpoch);}
}
