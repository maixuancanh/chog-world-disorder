// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Testnet treasury. Game actions stay offchain; only reserved withdrawals settle here.
contract ChogRewardVault is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    bytes32 public constant WITHDRAWAL_TYPEHASH = keccak256("Withdrawal(address wallet,uint256 amount,bytes32 requestId,uint256 deadline,uint256 epoch)");
    IERC20 public immutable token;
    address public rewardSigner;
    uint256 public signerEpoch;
    mapping(bytes32 => bool) public used;
    event Withdrawn(address indexed wallet, bytes32 indexed requestId, uint256 amount);
    event SignerChanged(address indexed signer, uint256 epoch);
    constructor(address token_, address signer_, address owner_) EIP712("ChogRewardVault", "1") Ownable(owner_) {
        require(block.chainid == 10143, "Monad testnet only");
        require(token_.code.length > 0 && signer_ != address(0), "Invalid configuration");
        token = IERC20(token_); rewardSigner = signer_;
    }
    function withdraw(address wallet, uint256 amount, bytes32 requestId, uint256 deadline, uint256 epoch, bytes calldata signature) external nonReentrant whenNotPaused {
        require(msg.sender == wallet, "Wallet must submit");
        require(amount > 0 && amount % 1e15 == 0, "Invalid milli-CHOG amount");
        require(block.timestamp <= deadline && epoch == signerEpoch, "Expired authorization");
        require(!used[requestId], "Already withdrawn");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(WITHDRAWAL_TYPEHASH, wallet, amount, requestId, deadline, epoch)));
        require(ECDSA.recover(digest, signature) == rewardSigner, "Invalid authorization");
        used[requestId] = true;
        token.safeTransfer(wallet, amount);
        emit Withdrawn(wallet, requestId, amount);
    }
    function setRewardSigner(address signer_) external onlyOwner { require(signer_ != address(0), "Zero signer"); rewardSigner = signer_; signerEpoch++; emit SignerChanged(signer_, signerEpoch); }
    function setPaused(bool value) external onlyOwner { if(value) _pause(); else _unpause(); }
    /// @dev Recovery is explicit and available only while withdrawals are paused.
    function recover(address to, uint256 amount) external onlyOwner whenPaused { token.safeTransfer(to, amount); }
}
