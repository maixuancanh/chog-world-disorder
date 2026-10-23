// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Fund with existing testCHOG transfers. Each wallet receives ten per day.
contract ChogTestFaucet is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    uint256 public constant CLAIM_AMOUNT = 10 ether;
    uint256 public constant CLAIM_INTERVAL = 1 days;
    mapping(address => uint256) public nextClaimAt;
    event Claimed(address indexed wallet, uint256 amount, uint256 nextClaimAt);
    constructor(address token_, address owner_) Ownable(owner_) {
        require(block.chainid == 10143, "Monad testnet only");
        require(token_.code.length > 0, "Invalid token");
        require(IERC20Metadata(token_).decimals() == 18, "Token decimals must be 18");
        token = IERC20(token_);
    }
    function claim() external nonReentrant whenNotPaused {
        require(block.timestamp >= nextClaimAt[msg.sender], "Claim once per day");
        nextClaimAt[msg.sender] = block.timestamp + CLAIM_INTERVAL;
        token.safeTransfer(msg.sender, CLAIM_AMOUNT);
        emit Claimed(msg.sender, CLAIM_AMOUNT, nextClaimAt[msg.sender]);
    }
    function setPaused(bool value) external onlyOwner { if (value) _pause(); else _unpause(); }
    function recover(address recipient, uint256 amount) external onlyOwner whenPaused {
        require(recipient != address(0), "Zero recipient");
        token.safeTransfer(recipient, amount);
    }
}
