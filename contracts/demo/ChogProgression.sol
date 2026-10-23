// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Progress stays with the NFT. Only server-verified cumulative results can be saved.
contract ChogProgression is EIP712, Ownable2Step {
    bytes32 public constant CHECKPOINT_TYPEHASH=keccak256("Checkpoint(uint256 tokenId,uint256 totalXp,uint256 matches,uint256 wins,uint256 epoch)");
    IERC721 public immutable collection;
    address public progressSigner;
    uint256 public signerEpoch;
    struct Stats { uint256 totalXp; uint256 matches; uint256 wins; }
    mapping(uint256=>Stats) public stats;
    event ProgressSaved(uint256 indexed tokenId,uint256 totalXp,uint256 matches,uint256 wins);
    event SignerChanged(address signer,uint256 epoch);
    constructor(address collection_,address signer_,address owner_) EIP712("ChogProgression","1") Ownable(owner_) {
        require(block.chainid==10143,"Monad testnet only");
        require(collection_.code.length>0&&signer_!=address(0),"Invalid configuration");
        collection=IERC721(collection_);progressSigner=signer_;
    }
    function save(uint256 tokenId,uint256 totalXp,uint256 matches,uint256 wins,uint256 epoch,bytes calldata signature) external {
        require(msg.sender==collection.ownerOf(tokenId)||msg.sender==progressSigner,"NFT owner or progression server only");
        require(epoch==signerEpoch,"Stale signer");
        require(matches<=type(uint32).max&&wins<=matches&&totalXp>=matches*500+wins*700&&totalXp<=matches*4000,"Invalid totals");
        Stats memory old=stats[tokenId];
        require(totalXp>old.totalXp&&matches>old.matches&&wins>=old.wins&&matches-wins>=old.matches-old.wins,"Stale checkpoint");
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(CHECKPOINT_TYPEHASH,tokenId,totalXp,matches,wins,epoch)));
        require(ECDSA.recover(digest,signature)==progressSigner,"Invalid signature");
        stats[tokenId]=Stats(totalXp,matches,wins);emit ProgressSaved(tokenId,totalXp,matches,wins);
    }
    function autoSyncVersion() external pure returns(uint256) { return 2; }
    function levelOf(uint256 tokenId) external view returns(uint256 level,uint256 xp,uint256 nextLevelXp) {
        uint256 total=stats[tokenId].totalXp;uint256 lo=1;uint256 hi=1<<32;
        while(lo<hi){uint256 mid=(lo+hi+1)/2;if((mid-1)*800+175*(mid-1)*mid<=total)lo=mid;else hi=mid-1;}
        return(lo,total-((lo-1)*800+175*(lo-1)*lo),800+lo*350);
    }
    function setProgressSigner(address signer_) external onlyOwner { require(signer_!=address(0),"Zero signer");progressSigner=signer_;signerEpoch++;emit SignerChanged(signer_,signerEpoch); }
}
