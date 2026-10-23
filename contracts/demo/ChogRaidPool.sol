// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Testnet CHOG incentives for verified boss raids. Not an external yield strategy.
/// Principal belongs to its depositor; NFTs never leave their owners' wallets.
contract ChogRaidPool is ReentrancyGuard,EIP712,Ownable2Step {
 using SafeERC20 for IERC20;
 IERC20 public immutable token;
 IERC721 public immutable collection;
 address public immutable raidSigner;
 uint256 public totalPrincipal;
 uint256 public rewardReserve;
 uint256 public rewardRate;
 uint256 public periodFinish;
 uint256 public lastUpdate;
 uint256 public rewardPerTokenStored;
 struct Position {uint256 amount;uint256 tokenId;uint256 nonce;uint256 paid;uint256 accrued;}
 mapping(address=>Position) public positions;
 struct Stats {uint256 wins;uint256 rewards;}
 mapping(uint256=>Stats) public nftStats;
 mapping(bytes32=>bool) public used;
 struct Raid {bytes32 roundId;address wallet;uint256 tokenId;uint256 positionNonce;uint256 rewardBps;uint256 deadline;}
 bytes32 public constant RAID_TYPEHASH=keccak256("Raid(bytes32 roundId,address wallet,uint256 tokenId,uint256 positionNonce,uint256 rewardBps,uint256 deadline)");
 event Staked(address indexed wallet,uint256 indexed tokenId,uint256 amount,uint256 nonce);
 event Withdrawn(address indexed wallet,uint256 amount);
 event Funded(uint256 amount,uint256 duration);
 event RaidClaimed(bytes32 indexed roundId,address indexed wallet,uint256 indexed tokenId,uint256 amount,uint256 rewardBps);
 constructor(address token_,address nft_,address signer_,address owner_) EIP712("ChogRaidPool","1") Ownable(owner_){
  require(block.chainid==10143,"Monad testnet only");
  require(token_.code.length>0&&nft_.code.length>0&&signer_!=address(0),"Invalid configuration");
  require(IERC20Metadata(token_).decimals()==18,"18 decimals required");token=IERC20(token_);collection=IERC721(nft_);raidSigner=signer_;
 }
 function rewardPerToken() public view returns(uint256){
  uint256 at=block.timestamp<periodFinish?block.timestamp:periodFinish;
  if(totalPrincipal==0||at<=lastUpdate)return rewardPerTokenStored;
  return rewardPerTokenStored+(at-lastUpdate)*rewardRate*1e18/totalPrincipal;
 }
 function earned(address wallet) public view returns(uint256){Position memory p=positions[wallet];return p.accrued+p.amount*(rewardPerToken()-p.paid)/1e18;}
 function _update(address wallet) internal {
  rewardPerTokenStored=rewardPerToken();lastUpdate=block.timestamp<periodFinish?block.timestamp:periodFinish;
  if(wallet!=address(0)){Position storage p=positions[wallet];p.accrued+=p.amount*(rewardPerTokenStored-p.paid)/1e18;p.paid=rewardPerTokenStored;}
 }
 function stake(uint256 amount,uint256 tokenId) external nonReentrant {
  require(amount>0&&collection.ownerOf(tokenId)==msg.sender,"NFT owner required");_update(msg.sender);Position storage p=positions[msg.sender];
  require(p.amount==0||p.tokenId==tokenId,"Withdraw previous position first");
  if(p.amount==0&&p.tokenId!=tokenId)p.accrued=0;
  uint256 beforeBalance=token.balanceOf(address(this));token.safeTransferFrom(msg.sender,address(this),amount);require(token.balanceOf(address(this))-beforeBalance==amount,"Unsupported token");
  p.amount+=amount;p.tokenId=tokenId;p.nonce++;totalPrincipal+=amount;emit Staked(msg.sender,tokenId,amount,p.nonce);
 }
 function withdraw(uint256 amount) external nonReentrant {
  _update(msg.sender);Position storage p=positions[msg.sender];require(amount>0&&amount<=p.amount,"Invalid principal amount");
  p.amount-=amount;p.nonce++;totalPrincipal-=amount;token.safeTransfer(msg.sender,amount);emit Withdrawn(msg.sender,amount);
 }
 function fund(uint256 amount,uint256 duration) external onlyOwner nonReentrant {
  require(block.timestamp>=periodFinish,"Campaign still running");require(duration>=60&&duration<=365 days&&amount>=duration,"Invalid funding");
  _update(address(0));uint256 beforeBalance=token.balanceOf(address(this));token.safeTransferFrom(msg.sender,address(this),amount);require(token.balanceOf(address(this))-beforeBalance==amount,"Unsupported token");
  rewardReserve+=amount;rewardRate=amount/duration;lastUpdate=block.timestamp;periodFinish=block.timestamp+duration;emit Funded(amount,duration);
 }
 function claimRaid(Raid calldata raid,bytes calldata signature) external nonReentrant {
  require(raid.wallet==msg.sender&&block.timestamp<=raid.deadline,"Invalid claimant or expired raid");
  require(raid.rewardBps>0&&raid.rewardBps<=10000,"Invalid contribution");
  Position storage p=positions[msg.sender];require(p.amount>0&&p.tokenId==raid.tokenId&&p.nonce==raid.positionNonce,"Stake position changed");
  require(collection.ownerOf(raid.tokenId)==msg.sender,"NFT ownership changed");
  bytes32 key=keccak256(abi.encode(raid.roundId,raid.wallet));require(!used[key],"Raid already claimed");
  bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(RAID_TYPEHASH,raid.roundId,raid.wallet,raid.tokenId,raid.positionNonce,raid.rewardBps,raid.deadline)));
  require(ECDSA.recover(digest,signature)==raidSigner,"Invalid raid signature");_update(msg.sender);
  uint256 amount=p.accrued*raid.rewardBps/10000;require(amount>0&&amount<=rewardReserve,"No funded reward");
  used[key]=true;p.accrued=0;rewardReserve-=amount;nftStats[raid.tokenId].wins++;nftStats[raid.tokenId].rewards+=amount;
  token.safeTransfer(msg.sender,amount);require(token.balanceOf(address(this))>=totalPrincipal,"Principal invariant");
  emit RaidClaimed(raid.roundId,msg.sender,raid.tokenId,amount,raid.rewardBps);
 }
}
